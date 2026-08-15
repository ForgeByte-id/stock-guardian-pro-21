import { supabase } from "@/integrations/supabase/client";
import type {
  ChannelCode,
  EventChannel,
  FulfillmentStatus,
  MarketplaceService,
  OrderItemInput,
  OrderQuantityLine,
  ReturnAllocationInput,
  ReturnInspectionLine,
  ReturnableAllocation,
  ReturnSubmissionResult,
  StockEvent,
  StockEventOptions,
  StockEventResult,
} from "./types";

type QueryResponse<T> = { data: T | null; error: { message: string } | null };
type ReadQuery<T> = PromiseLike<QueryResponse<T>> & {
  select(columns: string): ReadQuery<T>;
  eq(column: string, value: unknown): ReadQuery<T>;
  in(column: string, values: readonly unknown[]): ReadQuery<T>;
  single(): Promise<QueryResponse<T>>;
  maybeSingle(): Promise<QueryResponse<T>>;
};
type ReadClient = { from(table: string): ReadQuery<unknown> };
type RpcResponse = QueryResponse<StockEventResult>;
type ProcessStockEventRpc = (
  functionName: "process_stock_event",
  args: { p_event: StockEvent },
) => PromiseLike<RpcResponse>;

type OrderRecord = {
  id: string;
  order_number: string;
  status: string;
  channel_id: string;
};
type ChannelRecord = { code: string };
type ProductRecord = { id: string; name: string; sku: string | null };
type BundleRecord = { marketplace_listing: string | null };
type OrderItemRecord = { id: string };
type AllocationRecord = {
  id: string;
  order_item_id: string;
  component_product_id: string;
  batch_id: string;
  ledger_id: string;
  quantity: number;
};
type BatchRecord = { id: string; batch_number: string; expiry_date: string };
type ReturnLineRecord = { fulfillment_allocation_id: string; quantity: number };
type CancellationReversalRecord = { source_ref_id: string; quantity: number };
type ReturnRecord = { id: string; order_id: string };

function readTable<T>(table: string): ReadQuery<T> {
  // The checked-in generated schema predates the event-engine read tables;
  // keep the untyped escape hatch read-only and local to this adapter.
  return (supabase as unknown as ReadClient).from(table) as ReadQuery<T>;
}

async function readOne<T>(query: PromiseLike<QueryResponse<T>>, fallback: string): Promise<T> {
  const { data, error } = await query;
  if (error || data === null) throw new Error(error?.message ?? fallback);
  return data;
}

async function readRows<T>(query: PromiseLike<QueryResponse<T[]>>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

function randomToken(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function createReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomToken().slice(0, 8).toUpperCase()}`;
}

function eventMetadata(
  type: StockEvent["type"],
  reference: string,
  options?: StockEventOptions,
): Pick<StockEvent, "idempotencyKey" | "occurredAt"> {
  const idempotencyKey = options?.idempotencyKey?.trim() || `${type}:${reference}:${randomToken()}`;
  const occurredAt = options?.occurredAt ?? new Date().toISOString();
  if (!idempotencyKey.trim()) throw new Error("Idempotency key is required");
  if (!occurredAt.trim()) throw new Error("Event timestamp is required");
  return { idempotencyKey, occurredAt };
}

function toEventChannel(channel: ChannelCode | string): EventChannel {
  const normalized = channel.toUpperCase();
  if (normalized === "SHOPEE") return "shopee";
  if (normalized === "TIKTOK") return "tiktok";
  throw new Error(`Unsupported marketplace channel: ${channel}`);
}

function toChannelCode(channel: string): ChannelCode {
  const normalized = channel.toUpperCase();
  if (normalized === "SHOPEE") return "SHOPEE";
  if (normalized === "TIKTOK") return "TIKTOK";
  throw new Error(`Unsupported marketplace channel: ${channel}`);
}

function validatePositiveQuantity(quantity: number, label: string): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function validateReturnLines(lines: ReturnAllocationInput[]): void {
  if (lines.length === 0) throw new Error("At least one return allocation is required");
  const allocationIds = new Set<string>();
  for (const line of lines) {
    if (!line.fulfillmentAllocationId.trim() || allocationIds.has(line.fulfillmentAllocationId)) {
      throw new Error("Return allocations must be unique and non-empty");
    }
    validatePositiveQuantity(line.quantity, "Return quantity");
    allocationIds.add(line.fulfillmentAllocationId);
  }
}

async function processStockEvent(event: StockEvent): Promise<StockEventResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error(authError?.message ?? "Not authenticated");

  // process_stock_event exists in the migration but not in the checked-in generated RPC map.
  const rpc = supabase.rpc as unknown as ProcessStockEventRpc;
  const { data, error } = await rpc("process_stock_event", { p_event: event });
  if (error || data === null) throw new Error(error?.message ?? "Stock event failed");
  return data;
}

async function getOrder(orderId: string): Promise<OrderRecord> {
  return readOne(
    readTable<OrderRecord>("orders")
      .select("id, order_number, status, channel_id")
      .eq("id", orderId)
      .single(),
    "Order not found",
  );
}

async function getOrderByReference(orderNumber: string): Promise<OrderRecord> {
  return readOne(
    readTable<OrderRecord>("orders")
      .select("id, order_number, status, channel_id")
      .eq("order_number", orderNumber)
      .single(),
    "Created order not found",
  );
}

async function getChannel(channelId: string): Promise<ChannelCode> {
  const channel = await readOne(
    readTable<ChannelRecord>("channels").select("code").eq("id", channelId).single(),
    "Channel not found",
  );
  return toChannelCode(channel.code);
}

async function createOrderFromSkus(
  channel: ChannelCode,
  items: Array<{ lineReference: string; sku: string; quantity: number }>,
): Promise<{ order_id: string; order_number: string }> {
  if (items.length === 0) throw new Error("Minimal 1 item");
  for (const item of items) {
    if (!item.sku.trim()) throw new Error("Every order item requires a SKU");
    validatePositiveQuantity(item.quantity, "Order quantity");
  }

  const orderNumber = createReference(channel);
  const metadata = eventMetadata("order.created", orderNumber);
  const event: StockEvent = {
    ...metadata,
    channel: toEventChannel(channel),
    type: "order.created",
    externalReference: orderNumber,
    payload: { items },
  };
  await processStockEvent(event);
  const order = await getOrderByReference(orderNumber);
  return { order_id: order.id, order_number: order.order_number };
}

async function getReturnableLines(orderId: string): Promise<ReturnableAllocation[]> {
  const orderItems = await readRows(
    readTable<OrderItemRecord[]>("order_items").select("id").eq("order_id", orderId),
  );
  if (orderItems.length === 0) throw new Error("Order has no items");

  const allocations = await readRows(
    readTable<AllocationRecord[]>("fulfillment_allocations")
      .select("id, order_item_id, component_product_id, batch_id, ledger_id, quantity")
      .in(
        "order_item_id",
        orderItems.map((item) => item.id),
      ),
  );
  if (allocations.length === 0) throw new Error("Order has no fulfilled allocations");

  const reversals = await readRows(
    readTable<CancellationReversalRecord[]>("stock_ledger")
      .select("source_ref_id, quantity")
      .eq("source_type", "order_cancel_reversal")
      .in(
        "source_ref_id",
        allocations.map((allocation) => allocation.ledger_id),
      ),
  );
  const reversedByLedger = new Map<string, number>();
  for (const reversal of reversals) {
    reversedByLedger.set(
      reversal.source_ref_id,
      (reversedByLedger.get(reversal.source_ref_id) ?? 0) + reversal.quantity,
    );
  }

  const returned = await readRows(
    readTable<ReturnLineRecord[]>("return_lines")
      .select("fulfillment_allocation_id, quantity")
      .in(
        "fulfillment_allocation_id",
        allocations.map((allocation) => allocation.id),
      ),
  );
  const returnedByAllocation = new Map<string, number>();
  for (const line of returned) {
    returnedByAllocation.set(
      line.fulfillment_allocation_id,
      (returnedByAllocation.get(line.fulfillment_allocation_id) ?? 0) + line.quantity,
    );
  }

  const [products, batches] = await Promise.all([
    readRows(
      readTable<ProductRecord[]>("products")
        .select("id, name, sku")
        .in("id", allocations.map((allocation) => allocation.component_product_id)),
    ),
    readRows(
      readTable<BatchRecord[]>("batches")
        .select("id, batch_number, expiry_date")
        .in("id", allocations.map((allocation) => allocation.batch_id)),
    ),
  ]);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));

  return allocations.flatMap((allocation) => {
    const remaining =
      allocation.quantity -
      (reversedByLedger.get(allocation.ledger_id) ?? 0) -
      (returnedByAllocation.get(allocation.id) ?? 0);
    if (remaining <= 0) return [];
    const product = productsById.get(allocation.component_product_id);
    const batch = batchesById.get(allocation.batch_id);
    return [{
      fulfillmentAllocationId: allocation.id,
      quantity: remaining,
      productName: product?.name ?? null,
      sku: product?.sku ?? null,
      batchNumber: batch?.batch_number ?? null,
      expiryDate: batch?.expiry_date ?? null,
    }];
  });
}

async function getReturnId(reference: string): Promise<string> {
  const result = await readOne(
    readTable<ReturnRecord>("returns")
      .select("id, order_id")
      .eq("external_reference", reference)
      .single(),
    "Return created but could not be loaded",
  );
  return result.id;
}

export const simulationMarketplace: MarketplaceService = {
  async createOrder(channel: ChannelCode) {
    const bundles = (
      await readRows(
        readTable<BundleRecord[]>("bundles").select("marketplace_listing").eq("is_active", true),
      )
    ).filter((bundle) => bundle.marketplace_listing?.trim());

    if (bundles.length > 0 && Math.random() < 0.25) {
      const bundle = bundles[Math.floor(Math.random() * bundles.length)];
      return createOrderFromSkus(channel, [
        {
          lineReference: "line-1",
          sku: bundle.marketplace_listing!,
          quantity: 1 + Math.floor(Math.random() * 2),
        },
      ]);
    }

    const products = (
      await readRows(readTable<ProductRecord[]>("products").select("id, sku").eq("is_active", true))
    ).filter((product) => product.sku?.trim());
    if (products.length === 0) throw new Error("No products");
    const selected = [...products]
      .sort(() => Math.random() - 0.5)
      .slice(0, 1 + Math.floor(Math.random() * 3));
    return createOrderFromSkus(
      channel,
      selected.map((product, index) => ({
        lineReference: `line-${index + 1}`,
        sku: product.sku!,
        quantity: 1 + Math.floor(Math.random() * 5),
      })),
    );
  },

  async createOrderWithItems(channel: ChannelCode, items: OrderItemInput[]) {
    if (items.length === 0) throw new Error("Minimal 1 item");
    const products = await readRows(
      readTable<ProductRecord[]>("products")
        .select("id, sku")
        .eq("is_active", true)
        .in(
          "id",
          items.map((item) => item.product_id),
        ),
    );
    const productsById = new Map(products.map((product) => [product.id, product]));
    return createOrderFromSkus(
      channel,
      items.map((item, index) => {
        const product = productsById.get(item.product_id);
        if (!product?.sku?.trim()) throw new Error(`Product ${item.product_id} has no active SKU`);
        return { lineReference: `line-${index + 1}`, sku: product.sku, quantity: item.quantity };
      }),
    );
  },

  async updateOrderStatus(orderId: string, status: FulfillmentStatus, options?: StockEventOptions) {
    const order = await getOrder(orderId);
    const channel = await getChannel(order.channel_id);
    if (status === "SHIPPED" && channel !== "SHOPEE") {
      throw new Error("TikTok orders reach the stock cutoff at IN_TRANSIT");
    }
    if (status === "IN_TRANSIT" && channel !== "TIKTOK") {
      throw new Error("Shopee orders reach the stock cutoff at SHIPPED");
    }

    const metadata = eventMetadata("order.status_changed", order.order_number, options);
    return processStockEvent({
      ...metadata,
      channel: toEventChannel(channel),
      type: "order.status_changed",
      externalReference: order.order_number,
      payload: { status },
    });
  },

  async processOrder(orderId: string, options?: StockEventOptions) {
    return this.updateOrderStatus(orderId, "PROCESSING", options);
  },

  async shipOrder(orderId: string, options?: StockEventOptions) {
    const order = await getOrder(orderId);
    const channel = await getChannel(order.channel_id);
    return this.updateOrderStatus(
      orderId,
      channel === "SHOPEE" ? "SHIPPED" : "IN_TRANSIT",
      options,
    );
  },

  async deliverOrder(orderId: string, options?: StockEventOptions) {
    return this.updateOrderStatus(orderId, "DELIVERED", options);
  },

  async cancelOrder(
    orderId: string,
    reason: string,
    lines?: OrderQuantityLine[],
    options?: StockEventOptions,
  ) {
    if (!reason.trim()) throw new Error("Cancellation reason is required");
    if (lines) {
      if (lines.length === 0) throw new Error("Cancellation lines cannot be empty");
      for (const line of lines) {
        if (!line.lineReference.trim()) throw new Error("Cancellation line reference is required");
        validatePositiveQuantity(line.quantity, "Cancellation quantity");
      }
    }

    const order = await getOrder(orderId);
    const channel = await getChannel(order.channel_id);
    const metadata = eventMetadata("order.cancelled", order.order_number, options);
    return processStockEvent({
      ...metadata,
      channel: toEventChannel(channel),
      type: "order.cancelled",
      externalReference: order.order_number,
      payload: { reason: reason.trim(), ...(lines ? { lines } : {}) },
    });
  },

  async submitReturn(orderId: string, lines: ReturnAllocationInput[], options?: StockEventOptions) {
    validateReturnLines(lines);
    const order = await getOrder(orderId);
    if (!["SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"].includes(order.status)) {
      throw new Error(`Order cannot accept a return from ${order.status}`);
    }
    const channel = await getChannel(order.channel_id);
    const returnLines = await getReturnableLines(orderId);
    const remainingByAllocation = new Map(
      returnLines.map((line) => [line.fulfillmentAllocationId, line.quantity]),
    );
    for (const line of lines) {
      const remaining = remainingByAllocation.get(line.fulfillmentAllocationId) ?? 0;
      if (line.quantity > remaining)
        throw new Error("Return quantity exceeds remaining fulfilled quantity");
    }

    const reference = options?.externalReference?.trim() || createReference(`RETURN-${channel}`);
    const metadata = eventMetadata("return.submitted", reference, options);
    const result = await processStockEvent({
      ...metadata,
      channel: toEventChannel(channel),
      type: "return.submitted",
      externalReference: reference,
      payload: { orderId, lines },
    });
    return { ...result, return_id: await getReturnId(reference), external_reference: reference };
  },

  async getReturnableAllocations(orderId: string) {
    const order = await getOrder(orderId);
    if (!["SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"].includes(order.status)) {
      throw new Error(`Order cannot accept a return from ${order.status}`);
    }
    return getReturnableLines(orderId);
  },

  async receiveReturn(orderId: string, lines?: ReturnAllocationInput[]) {
    return this.submitReturn(orderId, lines ?? (await getReturnableLines(orderId)));
  },

  async inspectReturn(
    returnReference: string,
    lines: ReturnInspectionLine[],
    options?: StockEventOptions,
  ) {
    if (!returnReference.trim() || lines.length === 0)
      throw new Error("Return reference and lines are required");
    const returnCase = await readOne(
      readTable<ReturnRecord>("returns")
        .select("id, order_id")
        .eq("external_reference", returnReference)
        .single(),
      "Return not found",
    );
    const order = await getOrder(returnCase.order_id);
    const channel = await getChannel(order.channel_id);
    for (const line of lines) {
      if (!line.fulfillmentAllocationId.trim())
        throw new Error("Inspection allocation is required");
      validatePositiveQuantity(line.quantity, "Inspection quantity");
    }

    const inspectionReference =
      options?.externalReference?.trim() || createReference(`INSPECT-${channel}`);
    const metadata = eventMetadata("return.inspected", inspectionReference, options);
    return processStockEvent({
      ...metadata,
      channel: toEventChannel(channel),
      type: "return.inspected",
      externalReference: inspectionReference,
      payload: { returnReference, lines },
    });
  },
};

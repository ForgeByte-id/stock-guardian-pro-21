// Marketplace adapters share the authenticated stock-event envelope.
export type ChannelCode = "SHOPEE" | "TIKTOK";
export type EventChannel = Lowercase<ChannelCode>;

export type MarketplaceOrderStatus =
  | "RESERVED"
  | "PROCESSING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED"
  | "MANUAL_REVIEW";

export type FulfillmentStatus = "PROCESSING" | "SHIPPED" | "IN_TRANSIT" | "DELIVERED";
export type ReturnCondition = "resellable" | "damaged" | "lost_in_transit";

export type OrderItemInput = { product_id: string; quantity: number };
export type OrderQuantityLine = { lineReference: string; quantity: number };
export type ReturnAllocationInput = {
  fulfillmentAllocationId: string;
  quantity: number;
};
export type ReturnableAllocation = ReturnAllocationInput & {
  productName: string | null;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
};
export type ReturnInspectionLine = ReturnAllocationInput & {
  condition: ReturnCondition;
  batchCode?: string;
  receivedAt?: string;
  expiryDate?: string;
  notes?: string;
};

export type StockEventOptions = {
  idempotencyKey?: string;
  occurredAt?: string;
  externalReference?: string;
};

export type StockEvent =
  | {
      idempotencyKey: string;
      channel: EventChannel;
      type: "order.created";
      occurredAt: string;
      externalReference: string;
      payload: { items: Array<{ lineReference: string; sku: string; quantity: number }> };
    }
  | {
      idempotencyKey: string;
      channel: EventChannel;
      type: "order.status_changed";
      occurredAt: string;
      externalReference: string;
      payload: { status: FulfillmentStatus };
    }
  | {
      idempotencyKey: string;
      channel: EventChannel;
      type: "order.cancelled";
      occurredAt: string;
      externalReference: string;
      payload: { reason: string; lines?: OrderQuantityLine[] };
    }
  | {
      idempotencyKey: string;
      channel: EventChannel;
      type: "return.submitted";
      occurredAt: string;
      externalReference: string;
      payload: { orderId: string; lines: ReturnAllocationInput[] };
    }
  | {
      idempotencyKey: string;
      channel: EventChannel;
      type: "return.inspected";
      occurredAt: string;
      externalReference: string;
      payload: { returnReference: string; lines: ReturnInspectionLine[] };
    };

export type StockEventResult = {
  eventId: string;
  duplicate: boolean;
  status: string;
  ledgerEntryIds: string[];
  allocationIds: string[];
  claimRecordIds: string[];
};

export type ReturnSubmissionResult = StockEventResult & {
  return_id: string;
  external_reference: string;
};

export interface MarketplaceService {
  createOrder(channel: ChannelCode): Promise<{ order_id: string; order_number: string }>;
  createOrderWithItems(
    channel: ChannelCode,
    items: OrderItemInput[],
  ): Promise<{ order_id: string; order_number: string }>;
  updateOrderStatus(
    orderId: string,
    status: FulfillmentStatus,
    options?: StockEventOptions,
  ): Promise<StockEventResult>;
  processOrder(orderId: string, options?: StockEventOptions): Promise<StockEventResult>;
  shipOrder(orderId: string, options?: StockEventOptions): Promise<StockEventResult>;
  deliverOrder(orderId: string, options?: StockEventOptions): Promise<StockEventResult>;
  cancelOrder(
    orderId: string,
    reason: string,
    lines?: OrderQuantityLine[],
    options?: StockEventOptions,
  ): Promise<StockEventResult>;
  submitReturn(
    orderId: string,
    lines: ReturnAllocationInput[],
    options?: StockEventOptions,
  ): Promise<ReturnSubmissionResult>;
  getReturnableAllocations(orderId: string): Promise<ReturnableAllocation[]>;
  receiveReturn(orderId: string, lines?: ReturnAllocationInput[]): Promise<ReturnSubmissionResult>;
  inspectReturn(
    returnReference: string,
    lines: ReturnInspectionLine[],
    options?: StockEventOptions,
  ): Promise<StockEventResult>;
}

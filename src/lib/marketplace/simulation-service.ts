import { supabase } from "@/integrations/supabase/client";
import type { ChannelCode, MarketplaceService, OrderItemInput } from "./types";

// Picks 1–3 random products (or a random bundle) and creates a RESERVED order.
// Stock is NOT deducted at creation — only reservation.
export const simulationMarketplace: MarketplaceService = {
  async createOrder(channel: ChannelCode) {
    const { data: ch, error: chErr } = await supabase
      .from("channels").select("id, code").eq("code", channel).maybeSingle();
    if (chErr || !ch) throw new Error(chErr?.message ?? "Channel not found");

    // 25% chance of using a bundle if any exist for this channel
    const { data: bundles } = await supabase
      .from("bundles").select("id, name").eq("is_active", true).limit(20);

    const useBundle = bundles && bundles.length > 0 && Math.random() < 0.25;

    const orderNumber = `${channel}-${Date.now().toString(36).toUpperCase()}`;

    const { data: user } = await supabase.auth.getUser();
    const { data: newOrder, error: ordErr } = await supabase
      .from("orders").insert({
        order_number: orderNumber, channel_id: ch.id, status: "RESERVED",
        created_by: user.user?.id,
      }).select("id").single();
    if (ordErr || !newOrder) throw new Error(ordErr?.message ?? "Order create failed");

    if (useBundle) {
      const bundle = bundles![Math.floor(Math.random() * bundles!.length)];
      await supabase.from("order_items").insert({
        order_id: newOrder.id, product_id: (await supabase.from("bundle_items")
          .select("product_id").eq("bundle_id", bundle.id).limit(1).single()).data!.product_id,
        quantity: 1 + Math.floor(Math.random() * 2),
        is_bundle: true, bundle_id: bundle.id,
      });
    } else {
      const { data: products } = await supabase
        .from("products").select("id").eq("is_active", true).limit(70);
      if (!products || products.length === 0) throw new Error("No products");
      const n = 1 + Math.floor(Math.random() * 3);
      const shuffled = [...products].sort(() => Math.random() - 0.5).slice(0, n);
      const items = shuffled.map((p) => ({
        order_id: newOrder.id,
        product_id: p.id,
        quantity: 1 + Math.floor(Math.random() * 5),
        is_bundle: false,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(items);
      if (itErr) throw new Error(itErr.message);
    }

    return { order_id: newOrder.id, order_number: orderNumber };
  },

  async createOrderWithItems(channel: ChannelCode, items: OrderItemInput[]) {
    const { data: ch, error: chErr } = await supabase
      .from("channels").select("id, code").eq("code", channel).maybeSingle();
    if (chErr || !ch) throw new Error(chErr?.message ?? "Channel not found");
    if (items.length === 0) throw new Error("Minimal 1 item");

    const orderNumber = `${channel}-${Date.now().toString(36).toUpperCase()}`;
    const { data: user } = await supabase.auth.getUser();
    const { data: newOrder, error: ordErr } = await supabase
      .from("orders").insert({
        order_number: orderNumber, channel_id: ch.id, status: "RESERVED",
        created_by: user.user?.id,
      }).select("id").single();
    if (ordErr || !newOrder) throw new Error(ordErr?.message ?? "Order create failed");

    const { error: itErr } = await supabase.from("order_items").insert(
      items.map((i) => ({
        order_id: newOrder.id, product_id: i.product_id, quantity: i.quantity, is_bundle: false,
      }))
    );
    if (itErr) throw new Error(itErr.message);

    return { order_id: newOrder.id, order_number: orderNumber };
  },

  async shipOrder(orderId: string) {
    const { error } = await supabase.rpc("process_shipment", { p_order_id: orderId });
    if (error) throw new Error(error.message);
  },

  async cancelOrder(orderId: string, reason: string) {
    const { error } = await supabase.rpc("process_cancellation", {
      p_order_id: orderId, p_reason: reason,
    });
    if (error) throw new Error(error.message);
  },

  async receiveReturn(orderId: string) {
    // Order must be SHIPPED before it can be returned
    const { data: ord } = await supabase.from("orders").select("status").eq("id", orderId).single();
    if (ord?.status !== "SHIPPED" && ord?.status !== "RETURNED") {
      throw new Error(`Order must be SHIPPED to accept return (currently ${ord?.status})`);
    }
    const { data, error } = await supabase.from("returns").insert({
      order_id: orderId, return_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Return create failed");
    return { return_id: data.id };
  },
};

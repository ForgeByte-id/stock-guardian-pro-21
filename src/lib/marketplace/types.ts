// Marketplace adapter — swap SimulationMarketplaceService for a real API later
// without touching UI or stock RPCs.
export type ChannelCode = "SHOPEE" | "TIKTOK";

export interface MarketplaceService {
  createOrder(channel: ChannelCode): Promise<{ order_id: string; order_number: string }>;
  shipOrder(orderId: string): Promise<void>;
  cancelOrder(orderId: string, reason: string): Promise<void>;
  receiveReturn(orderId: string): Promise<{ return_id: string }>;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { simulationMarketplace } from "@/lib/marketplace/simulation-service";
import type { ChannelCode, ReturnableAllocation } from "@/lib/marketplace/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ShoppingCart, Truck, Ban, Undo2, Search, Plus, Trash2, AlertTriangle,
  ExternalLink, Webhook, ArrowRightFromLine, Check, ChevronsUpDown,
  CircleCheckBig, PackageCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/simulation")({
  component: SimulationPage,
});

/* ── Types ── */
type Order = {
  id: string; order_number: string; status: string; created_at: string;
  shipped_at: string | null; cancelled_at: string | null;
  channel: { code: string; name: string } | null;
};

type Product = { id: string; name: string; sku: string | null };

type OrderItemRow = { id: string; product_id: string; quantity: number; tempId?: number };
let _tempId = 0;

/* ── Status helpers ── */
const STATUS_CONFIG: Record<string, { explanation: string; cls: string }> = {
  RESERVED:  { explanation: "reservasi", cls: "bg-info/15 text-info-foreground border-info/40" },
  PROCESSING:{ explanation: "sedang diproses", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
  SHIPPED:   { explanation: "stok berkurang", cls: "bg-primary/15 text-primary border-primary/40" },
  IN_TRANSIT:{ explanation: "dalam perjalanan", cls: "bg-accent/15 text-accent-foreground border-accent/40" },
  DELIVERED: { explanation: "sudah diterima", cls: "bg-success/15 text-success-foreground border-success/40" },
  CANCELLED: { explanation: "dibatalkan", cls: "bg-muted text-muted-foreground" },
  RETURNED:  { explanation: "retur diterima", cls: "bg-secondary text-secondary-foreground border-secondary" },
  MANUAL_REVIEW: { explanation: "perlu ditinjau", cls: "bg-destructive/15 text-destructive border-destructive/40" },
};

function statusBadge(status: string) {
  const code = status.toUpperCase();
  const cfg = STATUS_CONFIG[code] ?? {
    explanation: "status belum dipetakan",
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <Badge
      variant="outline"
      className={`${cfg.cls} max-w-full gap-1 whitespace-normal text-left`}
      aria-label={`${code}: ${cfg.explanation}`}
    >
      <span className="font-mono text-[10px]">{code}</span>
      <span aria-hidden="true">·</span>
      <span>{cfg.explanation}</span>
    </Badge>
  );
}

function canCancel(order: Order): boolean {
  const status = order.status.toUpperCase();
  const channel = order.channel?.code.toUpperCase();
  return status === "RESERVED" || status === "PROCESSING" ||
    (status === "SHIPPED" && channel === "SHOPEE") ||
    (status === "IN_TRANSIT" && channel === "TIKTOK");
}

function canReceiveReturn(status: string): boolean {
  return ["SHIPPED", "IN_TRANSIT", "DELIVERED", "RETURNED"].includes(status.toUpperCase());
}

/* ── Page ── */
function SimulationPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);

  // Order creation form
  const [channel, setChannel] = useState<ChannelCode>("SHOPEE");
  const [items, setItems] = useState<OrderItemRow[]>([emptyItem()]);
  const [openProductSelect, setOpenProductSelect] = useState<number | null>(null);

  // Cancel dialog
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Partial return dialog. Inspection stays on the returns worklist.
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [returnAllocations, setReturnAllocations] = useState<ReturnableAllocation[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnSubmissionKey, setReturnSubmissionKey] = useState<string | null>(null);
  const [returnExternalReference, setReturnExternalReference] = useState<string | null>(null);
  const [returnUnavailableOrderIds, setReturnUnavailableOrderIds] = useState<Set<string>>(new Set());
  const returnSubmitLock = useRef(false);

  // Search
  const [search, setSearch] = useState("");

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    const [oRes, pRes] = await Promise.all([
      supabase.from("orders")
        .select("id,order_number,status,created_at,shipped_at,cancelled_at,channel:channel_id(code,name)")
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("products").select("id,name,sku").eq("is_active", true).order("name"),
    ]);
    setOrders((oRes.data ?? []) as unknown as Order[]);
    setProducts((pRes.data ?? []) as Product[]);
  }

  function emptyItem(): OrderItemRow {
    return { id: "", product_id: "", quantity: 1, tempId: ++_tempId };
  }

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx: number) => {
    if (items.length <= 1) return; // keep at least 1
    setItems(items.filter((_, i) => i !== idx));
  };
  const updateItem = (idx: number, field: keyof OrderItemRow, value: string | number) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const validItems = items.filter((it) => it.product_id && it.quantity > 0);
  const canCreate = validItems.length > 0 && !busy;

  async function handleCreateOrder() {
    if (!canCreate) return;
    setBusy(true);
    try {
      const result = await simulationMarketplace.createOrderWithItems(
        channel,
        validItems.map((it) => ({ product_id: it.product_id, quantity: it.quantity }))
      );
      toast.success(`Pesanan ${result.order_number} dibuat (RESERVED: reservasi).`);
      setItems([emptyItem()]);
      await loadAll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await loadAll(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const cancelBeforeCutoff = (order: Order) =>
    act(
      () => simulationMarketplace.cancelOrder(order.id, "Dibatalkan sebelum stok dipotong"),
      `Pesanan ${order.order_number} dibatalkan sebelum stok dipotong.`,
    );

  function createReturnToken(prefix: string): string {
    const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`;
  }

  async function startReturn(order: Order) {
    if (busy || returnLoading) return;
    setReturnOrder(order);
    setReturnAllocations([]);
    setReturnQuantities({});
    setReturnSubmissionKey(null);
    setReturnExternalReference(null);
    setReturnLoading(true);
    try {
      const allocations = await simulationMarketplace.getReturnableAllocations(order.id);
      setReturnAllocations(allocations);
      setReturnUnavailableOrderIds((current) => {
        const next = new Set(current);
        if (allocations.length === 0) next.add(order.id);
        else next.delete(order.id);
        return next;
      });
      setReturnQuantities(Object.fromEntries(
        allocations.map((allocation) => [allocation.fulfillmentAllocationId, 0]),
      ));
    } catch (e) {
      setReturnOrder(null);
      toast.error((e as Error).message);
    } finally {
      setReturnLoading(false);
    }
  }

  function closeReturnDialog() {
    setReturnOrder(null);
    setReturnAllocations([]);
    setReturnQuantities({});
    setReturnSubmissionKey(null);
    setReturnExternalReference(null);
  }

  function updateReturnQuantity(allocation: ReturnableAllocation, rawValue: string) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    const quantity = Number.isFinite(parsed)
      ? Math.min(allocation.quantity, Math.max(0, Math.trunc(parsed)))
      : 0;
    setReturnQuantities((current) => ({
      ...current,
      [allocation.fulfillmentAllocationId]: quantity,
    }));
    // A changed payload must get a new event identity. A failed retry keeps its key.
    setReturnSubmissionKey(null);
    setReturnExternalReference(null);
  }

  async function submitPartialReturn() {
    if (!returnOrder || returnLoading || busy || returnSubmitLock.current) return;
    const lines = returnAllocations.flatMap((allocation) => {
      const quantity = returnQuantities[allocation.fulfillmentAllocationId] ?? 0;
      return quantity > 0
        ? [{ fulfillmentAllocationId: allocation.fulfillmentAllocationId, quantity }]
        : [];
    });
    if (lines.length === 0) {
      toast.error("Masukkan minimal satu jumlah retur yang lebih dari 0.");
      return;
    }

    const idempotencyKey = returnSubmissionKey ?? createReturnToken("return.submitted");
    const externalReference = returnExternalReference ?? createReturnToken("RETURN");
    setReturnSubmissionKey(idempotencyKey);
    setReturnExternalReference(externalReference);
    returnSubmitLock.current = true;
    setBusy(true);
    try {
      const result = await simulationMarketplace.submitReturn(returnOrder.id, lines, {
        idempotencyKey,
        externalReference,
      });
      toast.success("Retur dicatat — lanjutkan inspeksi kondisi barang.");
      const returnId = result.return_id;
      closeReturnDialog();
      await loadAll();
      window.location.href = `/returns/${returnId}/inspect`;
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      returnSubmitLock.current = false;
      setBusy(false);
    }
  }

  const filteredOrders = orders.filter(
    (o) => o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      (o.channel?.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Simulasi Marketplace</h1>
        <p className="text-sm text-muted-foreground">
              Uji pesanan Shopee dan TikTok tanpa API marketplace. Event simulasi mengikuti jalur webhook, yaitu jalur penerimaan pembaruan dari marketplace asli, sehingga aturan stoknya tetap sama.
        </p>
      </div>

      {/* ── Order Creation Card ── */}
      <Card className="border-primary/10">
        <CardHeader className="border-b border-border/40 pb-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <ShoppingCart className="h-4 w-4 text-primary" />
            Buat pesanan simulasi
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Channel selector */}
          <div className="flex gap-2">
            {(["SHOPEE", "TIKTOK"] as const).map((ch) => (
              <button key={ch}
                onClick={() => setChannel(ch)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  channel === ch
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {ch === "SHOPEE" ? "Shopee" : "TikTok Shop"}
              </button>
            ))}
          </div>

          {/* Items list */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Produk dan jumlah pesanan
            </Label>

            {items.map((item, idx) => (
              <div key={item.tempId ?? idx} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Popover
                    open={openProductSelect === (item.tempId ?? idx)}
                    onOpenChange={(open) => setOpenProductSelect(open ? (item.tempId ?? idx) : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openProductSelect === (item.tempId ?? idx)}
                        aria-label="Pilih produk untuk pesanan"
                        className="h-9 w-full justify-between text-sm font-normal"
                      >
                        {products.find((p) => p.id === item.product_id)?.name ?? "Pilih produk untuk dipesan…"}
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Ketik nama produk atau SKU…" />
                        <CommandList>
                          <CommandEmpty>Produk tidak ditemukan. Coba kata kunci lain.</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.name} ${p.sku ?? ""}`}
                                onSelect={() => {
                                  updateItem(idx, "product_id", p.id);
                                  setOpenProductSelect(null);
                                }}
                              >
                                <Check className={cn("mr-2 h-3.5 w-3.5", item.product_id === p.id ? "opacity-100" : "opacity-0")} />
                                <span>{p.name}</span>
                                {p.sku && <span className="ml-1 text-xs text-muted-foreground">({p.sku})</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="w-20">
                  <Input
                    type="number" min={1} value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", Math.max(1, Number(e.target.value)))}
                    className="h-9 text-center"
                  />
                </div>
                <Button
                  variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(idx)}
                  disabled={items.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addItem} className="w-full mt-1">
              <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah produk
            </Button>
          </div>

          {/* Create button */}
          <div className="border-t border-border/30 pt-3 space-y-2">
            <Button
              className="w-full h-10"
              disabled={!canCreate}
              onClick={handleCreateOrder}
            >
              {busy ? (
                "Menyimpan pesanan…"
              ) : (
                <>
                  <ArrowRightFromLine className="mr-2 h-4 w-4" />
                  Buat pesanan &mdash; RESERVED
                </>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              <Webhook className="inline h-3 w-3 mr-0.5 align-text-bottom" />
              Pesanan baru berstatus RESERVED (reservasi), belum mengurangi stok di Stock Ledger
              (catatan setiap perubahan stok). Stok berkurang saat <strong>Set Dikirim</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Orders List ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Daftar pesanan simulasi</CardTitle>
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Cari nomor pesanan atau channel…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left font-medium py-2.5 px-3">Nomor pesanan</th>
                  <th className="text-left font-medium py-2.5 px-3">Channel</th>
                  <th className="text-left font-medium py-2.5 px-3">Status</th>
                  <th className="text-left font-medium py-2.5 px-3">Dibuat</th>
                  <th className="text-right font-medium py-2.5 px-3">Aksi pesanan</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      <ShoppingCart className="mx-auto h-8 w-8 mb-2 opacity-30" />
                      <p className="font-medium">Belum ada pesanan simulasi</p>
                      <p className="text-xs mt-1">Pilih produk dan channel, lalu klik Buat pesanan.</p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const status = o.status.toUpperCase();
                    const channelCode = o.channel?.code.toUpperCase();
                    const isShopee = channelCode === "SHOPEE";
                    const canFulfill = status === "PROCESSING" &&
                      (channelCode === "SHOPEE" || channelCode === "TIKTOK");
                    const canDeliver = (status === "SHIPPED" && isShopee) ||
                      (status === "IN_TRANSIT" && channelCode === "TIKTOK");
                    return (
                      <tr key={o.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-xs">{o.order_number}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-xs font-medium ${
                            o.channel?.code === "SHOPEE" ? "text-orange-600 dark:text-orange-400" : "text-pink-600 dark:text-pink-400"
                          }`}>
                            {o.channel?.name ?? "-"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">{statusBadge(o.status)}</td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("id-ID", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div
                            className="flex max-w-full flex-wrap items-center justify-end gap-1.5"
                            aria-label={`Aksi pesanan ${o.order_number}`}
                          >
                            {status === "RESERVED" && (
                              <>
                                <Button size="sm" disabled={busy}
                                  onClick={() => act(
                                    () => simulationMarketplace.processOrder(o.id),
                                    `Pesanan ${o.order_number} masuk PROCESSING (sedang diproses).`,
                                  )}>
                                  <PackageCheck className="mr-1 h-3.5 w-3.5" />
                                  Proses pesanan
                                </Button>
                                <Button size="sm" disabled={busy}
                                  variant="outline"
                                  onClick={() => void cancelBeforeCutoff(o)}>
                                  <Ban className="mr-1 h-3.5 w-3.5" />
                                  Batalkan
                                </Button>
                              </>
                            )}
                            {canFulfill && (
                              <>
                                {/* The channel-specific fulfillment event is only exposed at its cutoff state. */}
                                <Button size="sm" disabled={busy}
                                  onClick={() => act(
                                    () => simulationMarketplace.shipOrder(o.id),
                                    `Pesanan ${isShopee ? "dikirim (SHIPPED)" : "masuk IN_TRANSIT"} — stok berkurang otomatis dengan FEFO (batch kedaluwarsa terdekat).`,
                                  )}>
                                  <Truck className="mr-1 h-3.5 w-3.5" />
                                  {isShopee ? "Set dikirim" : "Set dalam perjalanan"}
                                </Button>
                                <Button size="sm" variant="outline" disabled={busy}
                                   onClick={() => void cancelBeforeCutoff(o)}>
                                  <Ban className="mr-1 h-3.5 w-3.5" />
                                  Batalkan
                                </Button>
                              </>
                            )}
                            {canDeliver && (
                              <Button size="sm" disabled={busy}
                                onClick={() => act(
                                  () => simulationMarketplace.deliverOrder(o.id),
                                  `Pesanan ${o.order_number} berstatus DELIVERED (sudah diterima).`,
                                )}>
                                <CircleCheckBig className="mr-1 h-3.5 w-3.5" />
                                Tandai diterima
                              </Button>
                            )}
                            {canCancel(o) && status !== "RESERVED" && status !== "PROCESSING" && (
                              <Button size="sm" variant="outline" disabled={busy}
                                onClick={() => { setCancelOrder(o); setCancelReason(""); }}>
                                <Undo2 className="mr-1 h-3.5 w-3.5" />
                                Batalkan
                              </Button>
                            )}
                            {canReceiveReturn(status) && !returnUnavailableOrderIds.has(o.id) && (
                              <>
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => void startReturn(o)}>
                                  <Undo2 className="mr-1 h-3.5 w-3.5 rotate-180" />
                                  Ajukan retur
                                </Button>
                              </>
                            )}
                            {(status === "CANCELLED" || status === "RETURNED" || status === "DELIVERED") && !canDeliver && (
                              <span className="text-xs text-muted-foreground">&mdash;</span>
                            )}
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="ml-1 shrink-0"
                              aria-label={`Lihat pergerakan stok untuk ${o.order_number}`}
                              title="Lihat pergerakan stok"
                            >
                              <Link to="/movements" search={{}}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        {orders.length > 0 && (
          <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground flex justify-between">
            <span>{orders.length} pesanan</span>
            <span className="text-[11px]">
              {orders.filter((o) => o.status === "RESERVED").length} reservasi aktif
              · {orders.filter((o) => o.status === "SHIPPED" || o.status.startsWith("IN_")).length} dalam perjalanan
              · {orders.filter((o) => o.status === "CANCELLED").length} dibatalkan
            </span>
          </div>
        )}
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Batalkan pesanan
            </DialogTitle>
            <DialogDescription>
              Pesanan <span className="font-mono font-medium">{cancelOrder?.order_number}</span> &mdash; {cancelOrder?.channel?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 text-sm space-y-1">
            {cancelOrder?.status === "SHIPPED" ? (
              <>
                <p className="font-medium text-warning-foreground">Pesanan sudah SHIPPED (stok sudah berkurang)</p>
                <p className="text-xs text-muted-foreground">
                  Stok akan dikembalikan ke batch asal lewat entri IN di Stock Ledger (catatan perubahan stok),
                  dengan reason cancellation. Batch dipulihkan sesuai alokasi FEFO saat pengiriman.
                </p>
              </>
            ) : cancelOrder?.status === "IN_TRANSIT" ? (
              <>
                <p className="font-medium text-warning-foreground">Pesanan sudah IN_TRANSIT (stok sudah berkurang)</p>
                <p className="text-xs text-muted-foreground">
                  Stok akan dikembalikan lewat entri IN di Stock Ledger (catatan perubahan stok),
                  dengan reason cancellation.
                </p>
              </>
            ) : cancelOrder?.status === "PROCESSING" ? (
              <>
                <p className="font-medium text-info-foreground">Pesanan masih PROCESSING (sedang diproses)</p>
                <p className="text-xs text-muted-foreground">
                  Stok belum berkurang, jadi pembatalan tidak menulis entri Stock Ledger (catatan perubahan stok).
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-info-foreground">Pesanan masih RESERVED (reservasi)</p>
                <p className="text-xs text-muted-foreground">
                  Tidak ada entri Stock Ledger yang ditulis karena stok belum berkurang. Pesanan langsung
                  berubah menjadi CANCELLED (dibatalkan).
                </p>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Alasan pembatalan</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Contoh: pembeli membatalkan pesanan" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOrder(null)} className="flex-1 sm:flex-none">Tutup</Button>
            <Button disabled={busy || !cancelReason.trim()} onClick={() => {
              if (!cancelOrder) return;
              const o = cancelOrder;
              setCancelOrder(null);
              return act(() => simulationMarketplace.cancelOrder(o.id, cancelReason), `Pesanan ${o.order_number} dibatalkan.`);
            }} className="flex-1 sm:flex-none">
              {busy ? "Memproses…" : "Konfirmasi pembatalan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial return submission is the single permanent action; inspection is a separate worklist step. */}
      <Dialog open={!!returnOrder} onOpenChange={(open) => !open && closeReturnDialog()}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="h-4 w-4 text-primary rotate-180" />
              Ajukan retur sebagian
            </DialogTitle>
            <DialogDescription>
              Pesanan <span className="font-mono font-medium">{returnOrder?.order_number}</span> — {returnOrder?.channel?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <p className="font-medium">Masukkan jumlah yang benar-benar dikembalikan.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Setiap baris adalah alokasi fulfillment (pembagian stok saat pesanan dipenuhi). Sisa adalah batas maksimal retur;
              angka 0 berarti alokasi tidak ikut diajukan.
            </p>
          </div>

          {returnLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Memuat alokasi stok yang masih bisa diretur…</div>
          ) : returnAllocations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Semua alokasi fulfillment untuk pesanan ini sudah diretur atau dibatalkan.
            </div>
          ) : (
            <div className="space-y-2" aria-label="Alokasi yang dapat diretur">
              {returnAllocations.map((allocation) => {
                const id = allocation.fulfillmentAllocationId;
                const quantity = returnQuantities[id] ?? 0;
                return (
                  <div key={id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{allocation.productName ?? "Produk fulfillment"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {allocation.sku ? `SKU ${allocation.sku} · ` : ""}
                        {allocation.batchNumber ? `Batch ${allocation.batchNumber}` : "Batch tidak tersedia"}
                        {allocation.expiryDate ? ` · kedaluwarsa ${new Date(allocation.expiryDate).toLocaleDateString("id-ID")}` : ""}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground/70" title={id}>Alokasi {id.slice(0, 8)}…</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">Sisa maksimal</p>
                        <p className="tabular-nums text-sm font-semibold">{allocation.quantity}</p>
                      </div>
                      <div className="w-24">
                        <Label htmlFor={`return-${id}`} className="sr-only">Jumlah retur</Label>
                        <Input
                          id={`return-${id}`}
                          type="number"
                          min={0}
                          max={allocation.quantity}
                          step={1}
                          value={quantity}
                          onChange={(event) => updateReturnQuantity(allocation, event.target.value)}
                          aria-describedby={`return-help-${id}`}
                          className="h-10 text-center tabular-nums"
                        />
                        <span id={`return-help-${id}`} className="sr-only">Maksimal {allocation.quantity}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2">
            <p><strong className="text-foreground">Layak jual:</strong> masuk ke batch baru dengan origin = retur, bukan batch asal.</p>
            <p><strong className="text-foreground">Rusak/hilang:</strong> membuat catatan klaim/loss tanpa pergerakan Stock Ledger kedua; stok sudah terpotong saat SHIPPED/IN_TRANSIT.</p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeReturnDialog} disabled={busy} className="flex-1 sm:flex-none">Tutup</Button>
            <Button
              onClick={() => void submitPartialReturn()}
              disabled={busy || returnLoading || returnAllocations.length === 0 || !Object.values(returnQuantities).some((quantity) => quantity > 0)}
              className="flex-1 sm:flex-none"
            >
              {busy ? "Menyimpan retur…" : "Ajukan retur & buka inspeksi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

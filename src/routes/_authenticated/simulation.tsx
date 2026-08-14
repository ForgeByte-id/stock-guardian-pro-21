import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { simulationMarketplace } from "@/lib/marketplace/simulation-service";
import type { ChannelCode } from "@/lib/marketplace/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ShoppingCart, Truck, Ban, Undo2, Search, Plus, Trash2, AlertTriangle,
  ExternalLink, Webhook, ArrowRightFromLine,
} from "lucide-react";

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
const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  RESERVED:  { label: "RESERVED · reservasi", cls: "bg-info/15 text-info-foreground border-info/40" },
  SHIPPED:   { label: "SHIPPED · stok berkurang", cls: "bg-primary/15 text-primary border-primary/40" },
  IN_TRANSIT:{ label: "IN_TRANSIT · stok berkurang",cls: "bg-primary/15 text-primary border-primary/40" },
  CANCELLED: { label: "CANCELLED · dibatalkan", cls: "bg-muted text-muted-foreground" },
  RETURNED:  { label: "RETURNED · retur diterima", cls: "bg-warning/15 text-warning-foreground border-warning/40" },
};

function statusBadge(s: string, ch?: string) {
  const key = s === "SHIPPED" && ch === "TIKTOK" ? "IN_TRANSIT" : s;
  const cfg = STATUS_CONFIG[key] ?? { label: s, cls: "" };
  return <Badge variant="outline" className={cfg.cls}>{cfg.label}</Badge>;
}

/* ── Page ── */
function SimulationPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(false);

  // Order creation form
  const [channel, setChannel] = useState<ChannelCode>("SHOPEE");
  const [items, setItems] = useState<OrderItemRow[]>([emptyItem()]);

  // Cancel dialog
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");

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
              Uji pesanan Shopee dan TikTok tanpa API marketplace. Event simulasi mengikuti jalur webhook, yaitu jalur penerimaan pembaruan dari marketplace.
          asli, sehingga aturan stoknya tetap sama.
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
                  <Select
                    value={item.product_id}
                    onValueChange={(v) => updateItem(idx, "product_id", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Pilih produk untuk dipesan…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span>{p.name}</span>
                          {p.sku && <span className="text-muted-foreground ml-1 text-xs">({p.sku})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    const isShopee = o.channel?.code === "SHOPEE";
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
                        <td className="py-2.5 px-3">{statusBadge(o.status, o.channel?.code)}</td>
                        <td className="py-2.5 px-3 text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("id-ID", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {o.status === "RESERVED" && (
                              <>
                                {/* Ship: Shopee → SHIPPED, TikTok → IN_TRANSIT */}
                                <Button size="sm" disabled={busy}
                                  onClick={() => act(
                                    () => simulationMarketplace.shipOrder(o.id),
                                    `Pesanan ${isShopee ? "dikirim (SHIPPED)" : "dalam perjalanan (IN_TRANSIT)"} — stok berkurang otomatis dengan FEFO (batch kedaluwarsa terdekat).`
                                  )}>
                                  <Truck className="mr-1 h-3.5 w-3.5" />
                                  Tandai dikirim
                                </Button>
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => { setCancelOrder(o); setCancelReason(""); }}>
                                  <Ban className="mr-1 h-3.5 w-3.5" />
                                  Batalkan
                                </Button>
                              </>
                            )}
                            {o.status === "SHIPPED" && (
                              <>
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => { setCancelOrder(o); setCancelReason(""); }}>
                                  <Undo2 className="mr-1 h-3.5 w-3.5" />
                                  Batalkan
                                </Button>
                                <Button size="sm" variant="outline" disabled={busy}
                                  onClick={() => act(async () => {
                                    const { return_id } = await simulationMarketplace.receiveReturn(o.id);
                                    window.location.href = `/returns/${return_id}/inspect`;
                                  }, "Retur diterima — lanjutkan inspeksi kondisi barang.")}>
                                  <Undo2 className="mr-1 h-3.5 w-3.5 rotate-180" />
                                  Catat retur
                                </Button>
                              </>
                            )}
                            {(o.status === "CANCELLED" || o.status === "RETURNED") && (
                              <span className="text-xs text-muted-foreground">&mdash;</span>
                            )}
                            <Button asChild size="sm" variant="ghost" className="ml-1">
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
    </div>
  );
}

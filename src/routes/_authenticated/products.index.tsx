import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Package, AlertTriangle, Ban } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products/")({
  component: ProductsPage,
});

/* ── Types ── */
type Product = {
  id: string; name: string; sku: string | null; category: string | null;
  low_stock_threshold: number; critical_stock_threshold: number; is_active: boolean;
};
type Batch = {
  id: string; product_id: string; batch_number: string;
  production_date: string; expiry_date: string;
  initial_stock: number; current_stock: number;
  is_active: boolean; origin: string;
};
type ProductCard = Product & {
  total_stock: number;
  reserved: number;
  available: number;
  batches: Batch[];
  status: "aman" | "peringatan" | "kritis";
};

/* ── Helpers ── */
function daysUntil(d: string): number {
  return (new Date(d).getTime() - Date.now()) / 86400000;
}

function productStatus(p: ProductCard): { label: string; variant: "success" | "warning" | "destructive" } {
  if (p.available <= p.critical_stock_threshold) return { label: "Kritis", variant: "destructive" };
  if (p.available <= p.low_stock_threshold) return { label: "Peringatan", variant: "warning" };
  return { label: "Aman", variant: "success" };
}

/* ── Page ── */
function ProductsPage() {
  const [cards, setCards] = useState<ProductCard[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null);
  const [newBatch, setNewBatch] = useState<any>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const [pRes, bRes] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("batches").select("*").order("expiry_date"),
    ]);
    const products = (pRes.data ?? []) as Product[];
    const batches = (bRes.data ?? []) as unknown as Batch[];

    // Reserved stock from RESERVED orders
    const { data: reservedOrders } = await supabase.from("orders")
      .select("id").eq("status", "RESERVED");
    const reservedIds = (reservedOrders ?? []).map((o) => o.id);
    let reservedMap = new Map<string, number>();

    if (reservedIds.length > 0) {
      const { data: items } = await supabase.from("order_items")
        .select("product_id, quantity, is_bundle, bundle_id")
        .in("order_id", reservedIds);
      const orderItems = items ?? [];
      const bundleIds = [...new Set(orderItems.filter((i) => i.is_bundle).map((i) => i.bundle_id!))];

      let bundleComponents: { bundle_id: string; product_id: string; quantity: number }[] = [];
      if (bundleIds.length > 0) {
        const { data: comps } = await supabase.from("bundle_items")
          .select("bundle_id, product_id, quantity")
          .in("bundle_id", bundleIds);
        bundleComponents = (comps ?? []) as { bundle_id: string; product_id: string; quantity: number }[];
      }

      orderItems.forEach((item) => {
        if (item.is_bundle) {
          bundleComponents
            .filter((c) => c.bundle_id === item.bundle_id)
            .forEach((c) => {
              const q = item.quantity * c.quantity;
              reservedMap.set(c.product_id, (reservedMap.get(c.product_id) ?? 0) + q);
            });
        } else {
          reservedMap.set(item.product_id, (reservedMap.get(item.product_id) ?? 0) + item.quantity);
        }
      });
    }

    const batchMap = new Map<string, Batch[]>();
    batches.forEach((b) => {
      if (!batchMap.has(b.product_id)) batchMap.set(b.product_id, []);
      batchMap.get(b.product_id)!.push(b);
    });

    const result: ProductCard[] = products.map((p) => {
      const productBatches = batchMap.get(p.id) ?? [];
      const total_stock = productBatches.reduce((s, b) => s + b.current_stock, 0);
      const reserved = reservedMap.get(p.id) ?? 0;
      return {
        ...p,
        total_stock,
        reserved,
        available: total_stock - reserved,
        batches: productBatches,
        status: "aman",
      };
    });
    // Compute status from available
    result.forEach((p) => {
      if (p.available <= p.critical_stock_threshold) p.status = "kritis";
      else if (p.available <= p.low_stock_threshold) p.status = "peringatan";
    });
    setCards(result);
    setLoading(false);
  }

  async function saveProduct() {
    if (!newProduct?.name) return toast.error("Nama wajib");
    const { error } = await supabase.from("products").insert({
      name: newProduct.name, sku: newProduct.sku ?? null, category: newProduct.category ?? null,
      low_stock_threshold: Number(newProduct.low_stock_threshold ?? 100),
      critical_stock_threshold: Number(newProduct.critical_stock_threshold ?? 50),
    });
    if (error) return toast.error(error.message);
    toast.success("Produk dibuat."); setNewProduct(null); void load();
  }

  async function saveBatch() {
    if (!newBatch?.product_id || !newBatch.batch_number || !newBatch.production_date || !newBatch.expiry_date)
      return toast.error("Lengkapi semua kolom");
    const init = Number(newBatch.initial_stock ?? 0);
    const { error } = await supabase.from("batches").insert({
      product_id: newBatch.product_id, batch_number: newBatch.batch_number,
      production_date: newBatch.production_date, expiry_date: newBatch.expiry_date,
      initial_stock: init, current_stock: init,
    });
    if (error) return toast.error(error.message);
    toast.success("Batch dibuat."); setNewBatch(null); void load();
  }

  const filtered = cards.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.sku?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      c.batches.some((b) => b.batch_number.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produk & Batch</h1>
          <p className="text-sm text-muted-foreground">
            {cards.length} produk · {cards.reduce((s, c) => s + c.batches.length, 0)} batch aktif
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNewBatch({ product_id: "" })}>
            <Plus className="mr-1.5 h-4 w-4" />Tambah Batch
          </Button>
          <Button size="sm" onClick={() => setNewProduct({})}>
            <Plus className="mr-1.5 h-4 w-4" />Produk Baru
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari produk, SKU, atau nomor batch…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-sm">
        <span className="text-success-foreground bg-success/10 px-2.5 py-1 rounded-full font-medium">
          {cards.filter((c) => c.status === "aman").length} Aman
        </span>
        <span className="text-warning-foreground bg-warning/15 px-2.5 py-1 rounded-full font-medium">
          {cards.filter((c) => c.status === "peringatan").length} Peringatan
        </span>
        <span className="text-destructive bg-destructive/10 px-2.5 py-1 rounded-full font-medium">
          {cards.filter((c) => c.status === "kritis").length} Kritis
        </span>
      </div>

      {/* Product Cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border bg-card animate-pulse p-5 space-y-3">
              <div className="h-5 bg-muted rounded w-2/3" />
              <div className="flex gap-2"><div className="h-10 bg-muted rounded flex-1" /><div className="h-10 bg-muted rounded flex-1" /><div className="h-10 bg-muted rounded flex-1" /></div>
              <div className="h-32 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="mx-auto h-10 w-10 mb-3 opacity-40" />
          <p className="font-medium">Tidak ada produk</p>
          <p className="text-sm mt-1">Produk aktif akan muncul di sini. Tambah produk baru lewat tombol di atas.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((p) => {
            const s = productStatus(p);
            const fefo = [...p.batches].sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());
            return (
              <div key={p.id} className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow">
                {/* Card Header: product identity */}
                <div className="px-5 pt-5 pb-3 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-base truncate">{p.name}</h3>
                      {p.sku && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">SKU: {p.sku}</p>
                      )}
                    </div>
                    <Badge variant={s.variant === "success" ? "outline" : "default"}
                      className={
                        s.variant === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30 shrink-0" :
                        s.variant === "warning" ? "bg-warning/15 text-warning-foreground border-warning/40 shrink-0" :
                        "bg-success/15 text-success-foreground border-success/40 shrink-0"
                      }>{s.label}</Badge>
                  </div>

                  {/* Metric chips */}
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <MetricChip label="Stok Fisik" value={p.total_stock.toLocaleString("id-ID")} />
                    <MetricChip label="Reservasi" value={p.reserved.toLocaleString("id-ID")}
                      highlight={p.reserved > 0} />
                    <MetricChip label="Aman Dijual" value={p.available.toLocaleString("id-ID")}
                      tone={p.available <= p.critical_stock_threshold ? "destructive" : p.available <= p.low_stock_threshold ? "warning" : "success"} />
                  </div>
                </div>

                {/* Card Body: batch table */}
                <div className="px-5 py-3">
                  {fefo.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">Belum ada batch untuk produk ini.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/40">
                            <th className="text-left font-medium py-1.5 pr-2">Batch</th>
                            <th className="text-left font-medium py-1.5 pr-2 whitespace-nowrap">Kadaluarsa</th>
                            <th className="text-center font-medium py-1.5 pr-2">FEFO</th>
                            <th className="text-center font-medium py-1.5 pr-2">Jenis</th>
                            <th className="text-right font-medium py-1.5">Sisa</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fefo.map((b, idx) => {
                            const days = daysUntil(b.expiry_date);
                            const nearlyExpired = days < 90;
                            return (
                              <tr key={b.id} className="border-b border-border/20 last:border-0">
                                <td className="py-1.5 pr-2">
                                  <span className="font-mono text-[11px]">{b.batch_number}</span>
                                </td>
                                <td className="py-1.5 pr-2 whitespace-nowrap">
                                  <span className={nearlyExpired ? "text-destructive font-medium" : ""}>
                                    {b.expiry_date}
                                  </span>
                                  {nearlyExpired && (
                                    <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />
                                  )}
                                </td>
                                <td className="py-1.5 pr-2 text-center">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium">
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="py-1.5 pr-2 text-center">
                                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                    b.origin === "retur"
                                      ? "bg-info/15 text-info-foreground"
                                      : "bg-muted text-muted-foreground"
                                  }`}>
                                    {b.origin === "retur" ? "Retur" : "Maklon"}
                                  </span>
                                </td>
                                <td className="py-1.5 text-right tabular-nums font-medium">
                                  {b.current_stock.toLocaleString("id-ID")}
                                  {b.current_stock === 0 && (
                                    <Ban className="inline h-3 w-3 ml-1 text-muted-foreground" />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Product Dialog */}
      <Dialog open={!!newProduct} onOpenChange={(o) => !o && setNewProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Produk Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Nama"><Input value={newProduct?.name ?? ""} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} /></Field>
            <Field label="SKU"><Input value={newProduct?.sku ?? ""} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} /></Field>
            <Field label="Kategori"><Input value={newProduct?.category ?? ""} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Threshold Peringatan"><Input type="number" value={newProduct?.low_stock_threshold ?? 100} onChange={(e) => setNewProduct({ ...newProduct, low_stock_threshold: Number(e.target.value) })} /></Field>
              <Field label="Threshold Kritis"><Input type="number" value={newProduct?.critical_stock_threshold ?? 50} onChange={(e) => setNewProduct({ ...newProduct, critical_stock_threshold: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewProduct(null)}>Batal</Button><Button onClick={saveProduct}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Batch Dialog */}
      <Dialog open={!!newBatch} onOpenChange={(o) => !o && setNewBatch(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Batch Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Produk">
              <select className="w-full border rounded-md h-9 px-2 text-sm bg-background" value={newBatch?.product_id ?? ""}
                onChange={(e) => setNewBatch({ ...newBatch, product_id: e.target.value })}>
                <option value="">— Pilih —</option>
                {cards.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Nomor Batch"><Input value={newBatch?.batch_number ?? ""} onChange={(e) => setNewBatch({ ...newBatch, batch_number: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tanggal Produksi"><Input type="date" value={newBatch?.production_date ?? ""} onChange={(e) => setNewBatch({ ...newBatch, production_date: e.target.value })} /></Field>
              <Field label="Kadaluarsa"><Input type="date" value={newBatch?.expiry_date ?? ""} onChange={(e) => setNewBatch({ ...newBatch, expiry_date: e.target.value })} /></Field>
            </div>
            <Field label="Stok Awal"><Input type="number" value={newBatch?.initial_stock ?? 0} onChange={(e) => setNewBatch({ ...newBatch, initial_stock: Number(e.target.value) })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewBatch(null)}>Batal</Button><Button onClick={saveBatch}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Mini components ── */
function MetricChip({ label, value, tone, highlight }: {
  label: string; value: string; tone?: "success" | "warning" | "destructive"; highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border py-2 px-2.5 text-center ${highlight ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10" : ""}`}>
      <div className={`text-lg font-bold tabular-nums leading-none ${
        tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning-foreground" : tone === "success" ? "text-success-foreground" : ""
      }`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

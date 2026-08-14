import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Download, Plus, Undo2, Search, ArrowUpRight, ArrowDownRight, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/movements/")({
  component: MovementsHistoryPage,
});

/* ── Types ── */
type SourceType =
  | "goods_in_maklon" | "manual_out"
  | "order_fulfillment" | "order_cancel_reversal"
  | "return_resellable" | "manual_correction"
  | "opname_correction" | "initial_balance";

type LedgerRow = {
  id: string;
  created_at: string;
  direction: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  notes: string | null;
  source_type: SourceType | null;
  reference_note: string | null;
  order_id: string | null;
  order_number: string | null;
  is_unverified: boolean | null;
  batch: { batch_number: string; products: { name: string; sku: string | null } | null } | null;
  reason: { name: string; code: string } | null;
  channel: { code: string; name: string } | null;
};

type Product = { id: string; name: string; sku: string | null };

/* ── Label mapping ── */
const MOVEMENT_LABEL: Record<string, string> = {
  goods_in_maklon:       "Masuk Maklon",
  manual_out:            "Pengeluaran Manual",
  order_fulfillment:     "Penjualan",
  order_cancel_reversal: "Pembatalan",
  return_resellable:     "Retur Masuk",
  manual_correction:     "Koreksi Manual",
  opname_correction:     "Koreksi Opname",
  initial_balance:       "Saldo Awal",
};

function movementLabel(r: LedgerRow): string {
  if (r.source_type && MOVEMENT_LABEL[r.source_type]) return MOVEMENT_LABEL[r.source_type];
  if (r.reason) return r.reason.name;
  return r.direction === "in" ? "Masuk" : "Keluar";
}

function refDisplay(r: LedgerRow): string {
  if (r.order_number) return r.order_number;
  if (r.reference_note) return r.reference_note;
  if (r.notes && r.notes.length < 30) return r.notes;
  return "—";
}

/* ── Page ── */
function MovementsHistoryPage() {
  // ── Data states ──
  const [allRows, setAllRows] = useState<LedgerRow[]>([]);
  const [reasons, setReasons] = useState<{ code: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ code: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // ── Seluruh Pergerakan filters ──
  const [reasonCode, setReasonCode] = useState("all");
  const [channelCode, setChannelCode] = useState("all");
  const [search, setSearch] = useState("");

  // ── Telusur Selisih ──
  const [traceProductId, setTraceProductId] = useState("all");
  const [traceRows, setTraceRows] = useState<LedgerRow[]>([]);
  const [traceLoading, setTraceLoading] = useState(false);

  // ── Koreksi dialog ──
  const [koreksiTarget, setKoreksiTarget] = useState<LedgerRow | null>(null);
  const [koreksiNote, setKoreksiNote] = useState("");
  const [koreksiBusy, setKoreksiBusy] = useState(false);

  // ── Init ──
  useEffect(() => { void init(); }, []);
  async function init() {
    const [rRes, cRes, pRes] = await Promise.all([
      supabase.from("movement_reasons").select("code,name").order("name"),
      supabase.from("channels").select("code,name"),
      supabase.from("products").select("id,name,sku").eq("is_active", true).order("name"),
    ]);
    setReasons(rRes.data ?? []);
    setChannels(cRes.data ?? []);
    setProducts((pRes.data ?? []) as Product[]);
  }

  // ── Load Seluruh Pergerakan ──
  useEffect(() => { void loadAll(); }, [reasonCode, channelCode]);
  async function loadAll() {
    let q = supabase.from("stock_ledger")
      .select(`id, created_at, direction, quantity, stock_before, stock_after,
        notes, source_type, reference_note, order_id, is_unverified,
        batch:batch_id(batch_number, products:product_id(name, sku)),
        reason:reason_id(name, code),
        channel:channel_id(code, name)`)
      .order("created_at", { ascending: false })
      .limit(500);

    const { data } = await q;
    const raw = (data ?? []) as unknown as LedgerRow[];

    // Fetch order numbers for all entries that have order_id
    const orderIds = [...new Set(raw.filter((r) => r.order_id).map((r) => r.order_id!))];
    let orderMap = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders").select("id, order_number").in("id", orderIds);
      (orders ?? []).forEach((o) => orderMap.set(o.id, o.order_number));
    }
    const withOrders = raw.map((r) => ({ ...r, order_number: r.order_id ? (orderMap.get(r.order_id) ?? null) : null }));

    // Filter in memory
    let filtered = withOrders;
    if (reasonCode !== "all") filtered = filtered.filter((r) => r.reason?.code === reasonCode);
    if (channelCode !== "all") filtered = filtered.filter((r) => r.channel?.code === channelCode);
    setAllRows(filtered);
  }

  const filteredRows = useMemo(() => {
    if (!search) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(
      (r) => (r.batch?.products?.name.toLowerCase().includes(q) ?? false) ||
        (r.batch?.batch_number.toLowerCase().includes(q) ?? false) ||
        (r.reason?.name.toLowerCase().includes(q) ?? false) ||
        (r.order_number?.toLowerCase().includes(q) ?? false)
    );
  }, [allRows, search]);

  // ── Load Telusur Selisih ──
  useEffect(() => {
    if (traceProductId && traceProductId !== "all") {
      setTraceLoading(true);
      void loadTrace(traceProductId);
    } else {
      setTraceRows([]);
    }
  }, [traceProductId]);

  async function loadTrace(productId: string) {
    // Get all batch IDs for this product
    const { data: batches } = await supabase
      .from("batches").select("id").eq("product_id", productId).eq("is_active", true);
    const batchIds = (batches ?? []).map((b) => b.id);
    if (batchIds.length === 0) { setTraceRows([]); setTraceLoading(false); return; }

    const { data } = await supabase
      .from("stock_ledger")
      .select(`id, created_at, direction, quantity, stock_before, stock_after,
        notes, source_type, reference_note, order_id, is_unverified,
        batch:batch_id(batch_number, products:product_id(name, sku)),
        reason:reason_id(name, code),
        channel:channel_id(code, name)`)
      .in("batch_id", batchIds)
      .order("created_at", { ascending: false })
      .limit(500);

    const raw = (data ?? []) as unknown as LedgerRow[];

    // Fetch order numbers
    const orderIds = [...new Set(raw.filter((r) => r.order_id).map((r) => r.order_id!))];
    let orderMap = new Map<string, string>();
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders").select("id, order_number").in("id", orderIds);
      (orders ?? []).forEach((o) => orderMap.set(o.id, o.order_number));
    }
    const withOrders = raw.map((r) => ({ ...r, order_number: r.order_id ? (orderMap.get(r.order_id) ?? null) : null }));

    setTraceRows(withOrders);
    setTraceLoading(false);
  }

  // ── Actions ──
  async function koreksiEntri() {
    if (!koreksiTarget) return;
    setKoreksiBusy(true);
    const { error } = await (supabase as any).rpc("koreksi_entri", {
      p_ledger_id: koreksiTarget.id,
      p_reference_note: koreksiNote || undefined,
    });
    setKoreksiBusy(false);
    setKoreksiTarget(null);
    setKoreksiNote("");
    if (error) { toast.error(error.message); return; }
    toast.success("Koreksi entri berhasil — entri pembalik tercatat.");
    void loadAll();
    if (traceProductId && traceProductId !== "all") void loadTrace(traceProductId);
  }

  function exportCsv() {
    const header = ["Waktu", "Produk", "Alasan", "Channel", "Ref", "Qty"];
    const lines = [header.join(",")];
    filteredRows.forEach((r) => {
      const qty = r.direction === "in" ? `+${r.quantity}` : `-${r.quantity}`;
      lines.push([
        r.created_at, r.batch?.products?.name ?? "", r.reason?.name ?? "",
        r.channel?.name ?? "", refDisplay(r), qty,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `jurnal-stok-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Stats ──
  const totalIn = allRows.filter((r) => r.direction === "in").reduce((s, r) => s + r.quantity, 0);
  const totalOut = allRows.filter((r) => r.direction === "out").reduce((s, r) => s + r.quantity, 0);

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Riwayat Jurnal Stok</h1>
          <p className="text-sm text-muted-foreground">
            Buku besar pergerakan stok &mdash; <span className="font-medium text-foreground/70">append-only, tidak dapat diedit.</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="mr-1.5 h-4 w-4" />Export CSV</Button>
          <Button asChild><Link to="/movements/new"><Plus className="mr-1.5 h-4 w-4" />Catat Pergerakan</Link></Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────── */}
      {/* CARD 1: Telusur Selisih                        */}
      {/* ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Telusur Selisih</CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Setiap unit bisa ditelusuri sampai kejadian aslinya &mdash; filter berdasarkan produk.</p>
          </div>
          <div className="w-56">
            <Select value={traceProductId} onValueChange={setTraceProductId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Pilih produk…" /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">— Semua produk —</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span>{p.name}</span>
                    {p.sku && <span className="text-muted-foreground ml-1 text-xs">({p.sku})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!traceProductId || traceProductId === "all" ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="mx-auto h-6 w-6 mb-2 opacity-30" />
              <p className="font-medium">Pilih produk untuk ditelusuri</p>
              <p className="text-xs mt-1">Gunakan filter di atas untuk melihat riwayat pergerakan dan saldo per produk.</p>
            </div>
          ) : traceLoading ? (
            <div className="text-center py-8">
              <div className="inline-block h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground mt-2">Memuat data…</p>
            </div>
          ) : traceRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="font-medium">Tidak ada pergerakan</p>
              <p className="text-xs mt-1">Produk ini belum memiliki riwayat stok.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="text-left font-medium py-2.5 px-3">Waktu</th>
                    <th className="text-left font-medium py-2.5 px-3">Pergerakan</th>
                    <th className="text-left font-medium py-2.5 px-3">Channel</th>
                    <th className="text-left font-medium py-2.5 px-3">Batch</th>
                    <th className="text-left font-medium py-2.5 px-3">Ref</th>
                    <th className="text-right font-medium py-2.5 px-3">Qty</th>
                    <th className="text-right font-medium py-2.5 px-3">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {traceRows.map((r) => {
                    const isIn = r.direction === "in";
                    const label = movementLabel(r);
                    return (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-muted/15 transition-colors">
                        <td className="py-2 px-3 whitespace-nowrap align-top">
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("id-ID", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="py-2 px-3 align-top">
                          <span className={`text-xs font-medium ${
                            label === "Masuk Maklon" ? "text-success-foreground" :
                            label === "Penjualan" ? "text-primary" :
                            label === "Koreksi Opname" || label === "Koreksi Manual" ? "text-warning-foreground" :
                            ""
                          }`}>{label}</span>
                        </td>
                        <td className="py-2 px-3 align-top text-xs text-muted-foreground">
                          {r.channel?.name ?? "Internal"}
                        </td>
                        <td className="py-2 px-3 align-top">
                          <span className="font-mono text-xs">{r.batch?.batch_number ?? "—"}</span>
                        </td>
                        <td className="py-2 px-3 align-top text-xs font-mono text-muted-foreground">
                          {refDisplay(r)}
                        </td>
                        <td className={`py-2 px-3 text-right align-top tabular-nums font-medium text-sm ${
                          isIn ? "text-success-foreground" : "text-primary"
                        }`}>
                          {isIn ? "+" : "−"}{r.quantity.toLocaleString("id-ID")}
                        </td>
                        <td className="py-2 px-3 text-right align-top tabular-nums text-sm text-muted-foreground">
                          {r.stock_after.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        {traceRows.length > 0 && (
          <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground flex justify-between bg-muted/10">
            <span>{traceRows.length} transaksi</span>
            <span>Saldo terkini: <strong className="text-foreground/70">{traceRows[0].stock_after.toLocaleString("id-ID")}</strong> unit</span>
          </div>
        )}
      </Card>

      {/* ──────────────────────────────────────────────── */}
      {/* CARD 2: Seluruh Pergerakan                     */}
      {/* ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">Seluruh Pergerakan</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Cari produk/batch…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
            {/* Filter: Alasan */}
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Alasan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua alasan</SelectItem>
                {reasons.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {/* Filter: Channel */}
            <Select value={channelCode} onValueChange={setChannelCode}>
              <SelectTrigger className="w-32 h-8"><SelectValue placeholder="Kanal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kanal</SelectItem>
                {channels.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left font-medium py-2.5 px-3">Waktu</th>
                  <th className="text-left font-medium py-2.5 px-3">Produk</th>
                  <th className="text-left font-medium py-2.5 px-3">Alasan</th>
                  <th className="text-left font-medium py-2.5 px-3">Channel</th>
                  <th className="text-left font-medium py-2.5 px-3">Ref</th>
                  <th className="text-right font-medium py-2.5 px-3">Qty</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      <p className="font-medium">Belum ada pergerakan</p>
                      <p className="text-xs mt-1">Coba ubah filter atau buat entri baru lewat tombol Catat Pergerakan.</p>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r) => {
                    const isIn = r.direction === "in";
                    return (
                      <tr key={r.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("id-ID", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-sm font-medium">{r.batch?.products?.name ?? "—"}</div>
                          {r.batch && (
                            <div className="text-[11px] text-muted-foreground font-mono">{r.batch.batch_number}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-xs">{movementLabel(r)}</td>
                        <td className="py-2.5 px-3 text-xs">{r.channel?.name ?? "—"}</td>
                        <td className="py-2.5 px-3 text-xs font-mono">{refDisplay(r)}</td>
                        <td className={`py-2.5 px-3 text-right tabular-nums font-medium ${
                          isIn ? "text-success-foreground" : "text-primary"
                        }`}>
                          {isIn ? "+" : "−"}{r.quantity.toLocaleString("id-ID")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        {allRows.length > 0 && (
          <div className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground flex justify-between bg-muted/10">
            <span>{filteredRows.length} dari {allRows.length} transaksi</span>
            <span className="tabular-nums">
              Masuk: <strong className="text-success-foreground">+{totalIn.toLocaleString("id-ID")}</strong>
              &nbsp;·&nbsp;
              Keluar: <strong className="text-primary">−{totalOut.toLocaleString("id-ID")}</strong>
            </span>
          </div>
        )}
      </Card>

      {/* ── Koreksi Entri Dialog ── */}
      <Dialog open={koreksiTarget !== null} onOpenChange={(v) => { if (!v) setKoreksiTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Koreksi Entri Stok</DialogTitle>
            <DialogDescription>
              Membuat entri pembalik untuk pergerakan {koreksiTarget?.direction === "in" ? "MASUK" : "KELUAR"} sebanyak {koreksiTarget?.quantity} unit &mdash;
              {koreksiTarget?.batch?.products?.name ?? "produk"} batch {koreksiTarget?.batch?.batch_number ?? "-"}.
              <br /><span className="text-destructive font-medium">Aksi ini permanen.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Catatan koreksi (opsional)</Label>
            <Input value={koreksiNote} onChange={(e) => setKoreksiNote(e.target.value)} placeholder="Misal: salah catat jumlah" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKoreksiTarget(null)}>Batal</Button>
            <Button variant="destructive" disabled={koreksiBusy} onClick={koreksiEntri}>
              {koreksiBusy ? "Memproses…" : "Buat Entri Pembalik"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

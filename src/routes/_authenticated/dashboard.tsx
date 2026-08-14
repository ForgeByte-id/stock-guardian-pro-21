import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Boxes, Archive, ScanLine, ArrowRight, Clock, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

/* ── Types ── */
type Metric = { label: string; value: number | string; sub: string; icon: React.ReactNode; tone?: "default" | "warn" | "danger" };

type ClaimItem = {
  return_id: string;
  order_number: string;
  channel_code: string;
  channel_name: string;
  claim_deadline: string;
  daysLeft: number;
  productNames: string;
  totalQty: number;
  critical: boolean;
};

type ExpiringItem = {
  product_name: string;
  batch_number: string;
  expiry_date: string;
  daysLeft: number;
  current_stock: number;
};

type WorklistItem = { id: string; kind: "claim" | "expiring"; critical: boolean; content: React.ReactNode };

type RecentMovement = {
  id: string;
  created_at: string;
  direction: string;
  quantity: number;
  source_type: string | null;
  notes: string | null;
  batch: { batch_number: string; products: { name: string; sku: string | null } | null } | null;
  reason: { name: string; code: string } | null;
};

/* ── Helpers ── */
function daysUntil(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

/* ── Page ── */
function DashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: "Total SKU Aktif", value: "—", sub: "produk maklon", icon: <Boxes className="h-4 w-4" /> },
    { label: "Batch Mendekati Exp.", value: "—", sub: "≤ 30 hari", icon: <Clock className="h-4 w-4" />, tone: "warn" },
    { label: "Retur Menunggu Inspeksi", value: "—", sub: "perlu diputuskan", icon: <Archive className="h-4 w-4" />, tone: "warn" },
    { label: "Anomali Terbuka", value: "—", sub: "worklist harian", icon: <ScanLine className="h-4 w-4" />, tone: "danger" },
  ]);
  const [worklist, setWorklist] = useState<WorklistItem[]>([]);
  const [recent, setRecent] = useState<RecentMovement[]>([]);

  useEffect(() => { void load(); }, []);

  async function load() {
    // Parallel load all data
    const [
      { count: totalSku },
      expiringRes,
      { count: pendingReturns },
      anomRes,
      claimsRes,
      recentRes,
    ] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }).eq("is_active", true),
      loadExpiring(),
      supabase.from("returns").select("*", { count: "exact", head: true }).eq("condition", "PENDING_INSPECTION"),
      supabase.rpc("stock_balance_consistency_check"),
      loadClaims(),
      supabase.from("stock_ledger")
        .select(`id, created_at, direction, quantity, notes, source_type,
          batch:batch_id(batch_number, products:product_id(name, sku)),
          reason:reason_id(name, code)`)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    const expiring = expiringRes ?? [];
    const claims = claimsRes ?? [];
    const anomaliesData = (anomRes.data ?? []) as unknown[];
    const recentData = (recentRes.data ?? []) as unknown as RecentMovement[];

    // Set metrics
    setMetrics([
      { label: "Total SKU Aktif", value: totalSku ?? 0, sub: "produk maklon", icon: <Boxes className="h-4 w-4" /> },
      { label: "Batch Mendekati Exp.", value: expiring.length, sub: "≤ 30 hari", icon: <Clock className="h-4 w-4" />, tone: expiring.length > 0 ? "warn" : "default" },
      { label: "Retur Menunggu Inspeksi", value: pendingReturns ?? 0, sub: "perlu diputuskan", icon: <Archive className="h-4 w-4" />, tone: (pendingReturns ?? 0) > 0 ? "warn" : "default" },
      { label: "Anomali Terbuka", value: anomaliesData.length, sub: "worklist harian", icon: <ScanLine className="h-4 w-4" />, tone: anomaliesData.length > 0 ? "danger" : "default" },
    ]);

    setRecent(recentData);

    // Build worklist: claims + expiring, sorted by urgency
    const items: WorklistItem[] = [];

    claims.forEach((c) => {
      items.push({
        id: `claim-${c.return_id}`,
        kind: "claim",
        critical: c.daysLeft < 7,
        content: (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-sm">
              <span className={`inline-block w-2 h-2 rounded-full ${c.daysLeft < 7 ? "bg-destructive" : "bg-warning"}`} />
              <span className="font-medium">
                Klaim {c.channel_name === "TikTok Shop" ? "TikTok" : c.channel_name} {c.order_number}
              </span>
              <Badge variant="outline" className={`ml-auto text-[10px] ${c.daysLeft < 7 ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-warning/15 text-warning-foreground border-warning/40"}`}>
                {c.daysLeft <= 0 ? "LEWAT" : `${c.daysLeft} hari lagi`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground pl-3.5">
              retur {c.productNames}
              <span className="tabular-nums"> &times;{c.totalQty}</span>
            </p>
            {c.critical && (
              <p className="text-[11px] text-destructive font-medium pl-3.5 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />kritis
              </p>
            )}
          </div>
        ),
      });
    });

    expiring.forEach((e) => {
      items.push({
        id: `exp-${e.batch_number}`,
        kind: "expiring",
        critical: e.daysLeft < 14,
        content: (
          <div className="space-y-1">
            <div className="text-sm flex items-center gap-1.5">
              <CalendarClock className={`h-3.5 w-3.5 shrink-0 ${e.daysLeft < 14 ? "text-destructive" : "text-warning"}`} />
              <span className="font-medium">{e.product_name}</span>
              <span className="font-mono text-xs text-muted-foreground">batch {e.batch_number}</span>
              <Badge variant="outline" className={`ml-auto text-[10px] ${e.daysLeft < 14 ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-warning/15 text-warning-foreground border-warning/40"}`}>
                {e.daysLeft <= 0 ? "LEWAT" : `${e.daysLeft} hari lagi`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground pl-5">
              kedaluwarsa {e.expiry_date} &middot; sisa <span className="tabular-nums font-medium">{e.current_stock.toLocaleString("id-ID")}</span>
            </p>
          </div>
        ),
      });
    });

    // Sort: critical first, then by deadline/expiry
    items.sort((a, b) => (a.critical === b.critical ? 0 : a.critical ? -1 : 1));
    setWorklist(items);
  }

  async function loadExpiring(): Promise<ExpiringItem[]> {
    const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString();
    const { data } = await supabase.from("batches")
      .select("id, batch_number, expiry_date, current_stock, product_id, products:product_id(name)")
      .lte("expiry_date", thirtyDays)
      .gt("current_stock", 0)
      .order("expiry_date");
    return ((data ?? []) as unknown[]).map((row: any) => ({
      product_name: row.products?.name ?? "—",
      batch_number: row.batch_number,
      expiry_date: row.expiry_date.slice(0, 10),
      daysLeft: daysUntil(row.expiry_date),
      current_stock: row.current_stock,
    }));
  }

  async function loadClaims(): Promise<ClaimItem[]> {
    const { data: returns } = await supabase
      .from("returns")
      .select(`id, claim_deadline, claim_status, condition, order_id,
        order:order_id(order_number, channel:channel_id(code, name))`)
      .not("claim_deadline", "is", null)
      .in("claim_status", ["pending", "filed"])
      .order("claim_deadline") as { data: any[] | null };

    if (!returns || returns.length === 0) return [];

    // Get order_items for each return's order
    const orderIds = [...new Set(returns.map((r) => r.order_id).filter(Boolean))];
    const { data: items } = orderIds.length > 0
      ? await supabase.from("order_items")
          .select("order_id, quantity, product_id, products:product_id(name)")
          .in("order_id", orderIds)
      : { data: [] };

    return returns.map((r) => {
      const order = r.order ?? {};
      const orderItems = (items ?? []).filter((it: any) => it.order_id === r.order_id);
      const productNames = orderItems.map((it: any) => it.products?.name).filter(Boolean).join(", ");
      const totalQty = orderItems.reduce((s: number, it: any) => s + it.quantity, 0);
      return {
        return_id: r.id,
        order_number: order.order_number ?? "—",
        channel_code: order.channel?.code ?? "",
        channel_name: order.channel?.name ?? "",
        claim_deadline: r.claim_deadline,
        daysLeft: daysUntil(r.claim_deadline),
        productNames: productNames || "(produk tidak dikenal)",
        totalQty,
        critical: daysUntil(r.claim_deadline) < 7,
      };
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Stok</h1>
        <p className="text-sm text-muted-foreground">Ringkasan real-time stok, kesehatan konsistensi, dan tren pergerakan.</p>
      </div>

      {/* Row 1: 4 Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{m.icon}{m.label}</div>
              <div className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${
                m.tone === "danger" ? "text-destructive" : m.tone === "warn" ? "text-warning-foreground" : ""
              }`}>{m.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{m.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 2: Worklist + Recent Movements */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Worklist — spans 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Worklist Anomali Harian</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">dicek otomatis tiap pagi</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/reconciliation/daily">
                Cek Konsistensi <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {worklist.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ScanLine className="mx-auto h-6 w-6 mb-2 opacity-30" />
                <p className="text-sm font-medium">Semua bersih</p>
                <p className="text-xs mt-1">Tidak ada anomali, klaim mendesak, atau batch yang akan kedaluwarsa dalam 30 hari.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {worklist.map((item) => (
                  <div key={item.id} className={`py-2.5 px-1 ${item.critical ? "bg-destructive/[0.03] -mx-2 px-3 rounded" : ""}`}>
                    {item.content}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pergerakan Terbaru */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pergerakan Terbaru</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground px-4">
                <p className="text-sm">Belum ada pergerakan.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {recent.map((r) => {
                  const isIn = r.direction === "in";
                  const label = r.source_type === "goods_in_maklon" ? "Masuk Maklon"
                    : r.source_type === "order_fulfillment" ? "Penjualan"
                    : r.source_type === "order_cancel_reversal" ? "Pembatalan"
                    : r.source_type === "return_resellable" ? "Retur Masuk"
                    : r.source_type === "opname_correction" ? "Koreksi Opname"
                    : r.source_type === "manual_correction" ? "Koreksi Manual"
                    : r.source_type === "manual_out" ? "Pengeluaran Manual"
                    : r.reason?.name ?? "Pergerakan";
                  return (
                    <div key={r.id} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {r.batch?.products?.name ?? "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <span>{label}</span>
                            {r.batch && <span className="font-mono">{r.batch.batch_number}</span>}
                          </p>
                        </div>
                        <div className={`text-right tabular-nums font-bold text-base ml-3 ${
                          isIn ? "text-success-foreground" : "text-primary"
                        }`}>
                          {isIn ? "+" : "−"}{r.quantity.toLocaleString("id-ID")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-border/30 px-4 py-2">
              <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                <Link to="/movements">Lihat semua &rarr;</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

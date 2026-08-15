import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PackageSearch, RefreshCw, Trash2, PackageX, ScrollText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/returns")({
  component: ReturnsPage,
});

/* ── Types ── */
type ReturnItem = {
  product_id: string;
  quantity: number;
  products: { name: string } | null;
};
type ReturnLine = { quantity: number; condition: string | null; inspected_at: string | null };

type ReturnRow = {
  id: string;
  return_date: string;
  condition: string;
  claim_status: string;
  inspected_at: string | null;
  order: {
    id: string;
    order_number: string;
    channel: { code: string; name: string } | null;
    order_items: ReturnItem[];
  } | null;
  return_lines?: ReturnLine[];
};

/* ── Helpers ── */
const CONDITION_STYLES: Record<string, { label: string; classes: string }> = {
  PENDING_INSPECTION: {
    label: "Menunggu inspeksi",
    classes: "bg-warning/10 text-warning-foreground border-warning/30",
  },
  RESALABLE: {
    label: "Layak jual",
    classes: "bg-success/10 text-success-foreground border-success/30",
  },
  DAMAGED: { label: "Rusak", classes: "bg-destructive/10 text-destructive border-destructive/30" },
  LOST: { label: "Hilang", classes: "bg-muted text-muted-foreground border-border" },
  MIXED: { label: "Campuran", classes: "bg-secondary text-secondary-foreground border-secondary" },
};

const CLAIM_STYLES: Record<string, { label: string; classes: string }> = {
  no_claim: { label: "Tidak perlu klaim", classes: "bg-muted/50 text-muted-foreground" },
  needs_claim: { label: "Perlu klaim", classes: "bg-warning/10 text-warning-foreground" },
  claimed: { label: "Klaim diajukan", classes: "bg-info/10 text-info-foreground" },
  settled: { label: "Klaim selesai", classes: "bg-success/10 text-success-foreground" },
};

function conditionStyle(cond: string) {
  return CONDITION_STYLES[cond] ?? { label: cond, classes: "bg-muted/30 text-muted-foreground" };
}

function statusBadge(code: string, style: { label: string; classes: string }) {
  const rawCode = code.toUpperCase();
  return (
    <Badge
      variant="outline"
      className={`max-w-full gap-1 whitespace-normal text-left text-[11px] ${style.classes}`}
      aria-label={`${rawCode}: ${style.label}`}
    >
      <span className="font-mono text-[10px]">{rawCode}</span>
      <span aria-hidden="true">·</span>
      <span>{style.label}</span>
    </Badge>
  );
}

function displayCondition(row: ReturnRow): string {
  const lines = row.return_lines ?? [];
  if (lines.length === 0) return row.condition;
  if (lines.some((line) => !line.condition)) return "PENDING_INSPECTION";
  const conditions = new Set(lines.map((line) => line.condition));
  if (conditions.size !== 1) return "MIXED";
  const condition = [...conditions][0];
  return condition === "resellable" ? "RESALABLE" : condition === "damaged" ? "DAMAGED" : "LOST";
}

function hasInspectionWork(row: ReturnRow): boolean {
  const lines = row.return_lines ?? [];
  return lines.length > 0
    ? lines.some((line) => !line.condition)
    : row.condition === "PENDING_INSPECTION";
}

function claimStyle(st: string) {
  return CLAIM_STYLES[st] ?? { label: st, classes: "bg-muted/30 text-muted-foreground" };
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ── L e d g e r  E f f e c t  c a r d s ── */
const LEDGER_EFFECTS = [
  {
    condition: "Layak Jual",
    icon: <RefreshCw className="h-4 w-4" />,
    desc: "Masuk kembali ke stok lewat batch baru (origin = retur); FEFO tetap berlaku.",
    note: "Stok terpisah dari batch asal agar jejak retur tetap jelas.",
    classes: "border-success/20 bg-success/5",
    iconClasses: "text-success-foreground",
  },
  {
    condition: "Rusak",
    icon: <PackageX className="h-4 w-4" />,
    desc: "Tidak ada pergerakan stok kedua (sudah terpotong saat SHIPPED).",
    note: "Dicatat sebagai claim/loss record, yaitu catatan untuk menindaklanjuti klaim kerusakan.",
    classes: "border-destructive/20 bg-destructive/5",
    iconClasses: "text-destructive",
  },
  {
    condition: "Hilang",
    icon: <Trash2 className="h-4 w-4" />,
    desc: "Tidak ada pergerakan stok kedua (sudah terpotong saat SHIPPED).",
    note: "Dipisah dari rusak karena proses klaimnya berbeda (TikTok 40 hari).",
    classes: "border-border/40 bg-muted/30",
    iconClasses: "text-muted-foreground",
  },
];

/* ── P a g e ── */
function ReturnsPage() {
  const [all, setAll] = useState<ReturnRow[]>([]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("returns")
      .select(
        `id, return_date, condition, claim_status, inspected_at,
        order:order_id(id, order_number,
          channel:channel_id(code, name),
          order_items(product_id, quantity, products:product_id(name))),
        return_lines(quantity, condition, inspected_at)`,
      )
      .order("return_date", { ascending: false })
      .limit(50);

    setAll((data ?? []) as unknown as ReturnRow[]);
  }

  const pending = all.filter((r) => displayCondition(r) === "PENDING_INSPECTION");
  const history = all.filter((r) => displayCondition(r) !== "PENDING_INSPECTION");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Retur</h1>
          <p className="text-sm text-muted-foreground">
            Pengembalian pesanan dari Shopee &amp; TikTok Shop — periksa kondisi, pantau klaim, dan
            rekonsiliasi.
          </p>
        </div>
      </div>

      {/* ════════════════════════════════════════════ */}
      {/*  CARD 1 — Menunggu Inspeksi                 */}
      {/* ════════════════════════════════════════════ */}
      <Card className="border-warning/20">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/10">
              <PackageSearch className="h-4 w-4 text-warning-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Menunggu inspeksi</CardTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                {pending.length > 0
                  ? `${pending.length} retur perlu ditentukan kondisinya`
                  : "Semua retur sudah diinspeksi"}
              </p>
            </div>
          </div>
          {pending.length > 0 && (
            <Badge
              variant="outline"
              className="bg-warning/10 text-warning-foreground border-warning/30 text-xs"
            >
              {pending.length} menunggu inspeksi
            </Badge>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <PackageSearch className="h-8 w-8 mb-2 opacity-30" />
              <p className="font-medium text-sm">Belum ada retur yang menunggu inspeksi</p>
              <p className="text-xs mt-1">
                Retur baru muncul di sini setelah pembeli mengajukan pengembalian.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[240px]">Produk &amp; jumlah retur</TableHead>
                    <TableHead>No. order</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Tanggal retur diajukan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right w-[280px]">Tindakan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => {
                    const items = r.order?.order_items ?? [];
                    const returnLines = r.return_lines ?? [];
                    const submittedQuantity = returnLines.reduce(
                      (total, line) => total + line.quantity,
                      0,
                    );
                    const pendingLineCount = returnLines.filter((line) => !line.condition).length;
                    return (
                      <TableRow key={r.id} className="group">
                        {/* The order item quantity is not the return quantity: returns are submitted per allocation. */}
                        <TableCell className="py-3">
                          {items.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-sm font-medium leading-snug">
                                {items.map((it) => it.products?.name ?? "—").join(", ")}
                              </p>
                              <p className="text-[11px] text-muted-foreground tabular-nums">
                                {submittedQuantity} unit diajukan dari alokasi fulfillment
                                {pendingLineCount > 0 &&
                                  ` · ${pendingLineCount} baris belum diinspeksi`}
                              </p>
                            </div>
                          )}
                        </TableCell>
                        {/* Order ref */}
                        <TableCell className="py-3">
                          <span className="font-mono text-xs">{r.order?.order_number ?? "—"}</span>
                        </TableCell>
                        {/* Channel */}
                        <TableCell className="py-3">
                          <span className="text-xs">{r.order?.channel?.name ?? "—"}</span>
                        </TableCell>
                        {/* Return date */}
                        <TableCell className="py-3 text-xs text-muted-foreground">
                          {formatDate(r.return_date)}
                        </TableCell>
                        <TableCell className="py-3">
                          {statusBadge("PENDING_INSPECTION", conditionStyle("PENDING_INSPECTION"))}
                        </TableCell>
                        {/* Action buttons */}
                        <TableCell className="py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {hasInspectionWork(r) && (
                              <ActionBtn
                                label={pendingLineCount > 0 && pendingLineCount < returnLines.length
                                  ? "Lanjutkan inspeksi"
                                  : "Inspeksi retur"}
                                to="/returns/$id/inspect"
                                params={{ id: r.id }}
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {/* Ledger effect info — always visible */}
        {pending.length > 0 && (
          <div className="border-t border-border/40 px-5 py-4 bg-muted/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-muted/60">
                <ScrollText className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Dampak pada Stock Ledger
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LEDGER_EFFECTS.map((e) => (
                <div key={e.condition} className={`rounded-lg border px-3.5 py-3 ${e.classes}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={e.iconClasses}>{e.icon}</span>
                    <span className="text-xs font-semibold">{e.condition}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{e.desc}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 italic">{e.note}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ════════════════════════════════════════════ */}
      {/*  CARD 2 — Riwayat Retur                      */}
      {/* ════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/30">
          <CardTitle className="text-base">Riwayat retur yang sudah diperiksa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Tanggal retur</TableHead>
                  <TableHead>Jumlah diajukan</TableHead>
                  <TableHead>Kondisi</TableHead>
                  <TableHead>Klaim</TableHead>
                  <TableHead>Tanggal inspeksi</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 && pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      <PackageSearch className="mx-auto h-6 w-6 mb-2 opacity-30" />
                      <p className="font-medium">Belum ada retur tercatat</p>
                      <p className="text-xs mt-1">
                        Retur dari Simulasi Marketplace muncul setelah pesanan dikirim dan pembeli
                        mengajukan pengembalian.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((r) => (
                    <TableRow key={r.id} className="group">
                      <TableCell className="font-mono text-xs py-3">
                        {r.order?.order_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs py-3">
                        {r.order?.channel?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3">
                        {formatDate(r.return_date)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums py-3">
                        {(r.return_lines ?? []).reduce((total, line) => total + line.quantity, 0)}{" "}
                        unit
                      </TableCell>
                      <TableCell className="py-3">
                        {statusBadge(displayCondition(r), conditionStyle(displayCondition(r)))}
                      </TableCell>
                      <TableCell className="py-3">
                        {statusBadge(r.claim_status, claimStyle(r.claim_status))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums py-3">
                        {r.inspected_at ? formatDate(r.inspected_at) : "—"}
                      </TableCell>
                      <TableCell className="py-3">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs opacity-60 transition-opacity group-hover:opacity-100"
                          aria-label={`Tinjau inspeksi retur ${r.order?.order_number ?? ""}`}
                          title="Tinjau inspeksi"
                        >
                          <Link to="/returns/$id/inspect" params={{ id: r.id }}>
                            <ArrowRight className="h-3.5 w-3.5" />
                            Tinjau
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {history.length > 0 && (
          <div className="border-t border-border/40 px-5 py-3 text-xs text-muted-foreground bg-muted/10 flex justify-between">
            <span>{history.length} retur selesai diproses</span>
            <span>
              {all.filter((r) => displayCondition(r) === "RESALABLE").length} layak jual
              &nbsp;·&nbsp;
              {all.filter((r) => displayCondition(r) === "DAMAGED").length} rusak &nbsp;·&nbsp;
              {all.filter((r) => displayCondition(r) === "LOST").length} hilang
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ── Mini: Action Button ── */
function ActionBtn({
  label,
  to,
  params,
}: {
  label: string;
  to: string;
  params: Record<string, string>;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors border ";

  return (
    <Button asChild variant="outline" className={`${base}h-8 whitespace-nowrap`}>
      <Link to={to} params={params} aria-label={label}>
        <PackageSearch className="h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}

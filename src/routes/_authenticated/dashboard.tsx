import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Boxes, PackageX, Archive } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type Row = {
  product_id: string;
  product_name: string;
  sku: string | null;
  total_stock: number;
  low: number;
  crit: number;
  earliest_expiry: string | null;
};

function statusOf(r: Row): { label: string; variant: "success" | "warning" | "destructive" } {
  if (r.total_stock <= r.crit) return { label: "Kritis", variant: "destructive" };
  if (r.total_stock <= r.low) return { label: "Peringatan", variant: "warning" };
  return { label: "Aman", variant: "success" };
}

function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [anomalies, setAnomalies] = useState<number>(0);
  const [trend, setTrend] = useState<{ date: string; out: number; in: number }[]>([]);

  useEffect(() => { void load(); }, []);

  async function load() {
    // Products with aggregated batch stock
    const { data: products } = await supabase.from("products")
      .select("id, name, sku, low_stock_threshold, critical_stock_threshold, is_active")
      .eq("is_active", true).order("name");
    const { data: batches } = await supabase.from("batches")
      .select("product_id, current_stock, expiry_date, is_active").eq("is_active", true);

    const map = new Map<string, Row>();
    products?.forEach((p) => map.set(p.id, {
      product_id: p.id, product_name: p.name, sku: p.sku,
      total_stock: 0, low: p.low_stock_threshold, crit: p.critical_stock_threshold,
      earliest_expiry: null,
    }));
    batches?.forEach((b) => {
      const r = map.get(b.product_id);
      if (!r) return;
      r.total_stock += b.current_stock;
      if (!r.earliest_expiry || b.expiry_date < r.earliest_expiry) r.earliest_expiry = b.expiry_date;
    });
    setRows([...map.values()]);

    const { data: anom } = await supabase.rpc("daily_consistency_check");
    setAnomalies(Array.isArray(anom) ? anom.length : 0);

    // 7-day IN/OUT trend
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: ledger } = await supabase.from("stock_ledger")
      .select("direction, quantity, created_at").gte("created_at", since);
    const days: Record<string, { in: number; out: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days[d] = { in: 0, out: 0 };
    }
    ledger?.forEach((l) => {
      const d = l.created_at.slice(0, 10);
      if (!days[d]) return;
      if (l.direction === "in") days[d].in += l.quantity;
      else days[d].out += l.quantity;
    });
    setTrend(Object.entries(days).map(([date, v]) => ({ date: date.slice(5), ...v })));
  }

  const filtered = rows.filter(
    (r) => r.product_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.sku?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const total = rows.reduce((s, r) => s + r.total_stock, 0);
  const critical = rows.filter((r) => r.total_stock <= r.crit).length;
  const warning = rows.filter((r) => r.total_stock > r.crit && r.total_stock <= r.low).length;

  const soon = rows.filter((r) => {
    if (!r.earliest_expiry) return false;
    const days = (new Date(r.earliest_expiry).getTime() - Date.now()) / 86400000;
    return days < 90;
  }).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Stok</h1>
        <p className="text-sm text-muted-foreground">Ringkasan real-time stok, kesehatan konsistensi, dan tren pergerakan.</p>
      </div>

      {anomalies > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Anomali terdeteksi</AlertTitle>
          <AlertDescription>
            {anomalies} batch memiliki selisih antara catatan sistem dan buku besar. {" "}
            <Link to="/reconciliation/daily" className="underline font-medium">Buka Cek Konsistensi →</Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={<Boxes className="h-4 w-4" />} label="Total Unit Stok" value={total.toLocaleString("id-ID")} />
        <Metric icon={<PackageX className="h-4 w-4" />} label="Produk Kritis" value={critical} tone="destructive" />
        <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Produk Peringatan" value={warning} tone="warning" />
        <Metric icon={<Archive className="h-4 w-4" />} label="Batch Segera Kadaluarsa" value={soon} tone="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tren Pergerakan (7 Hari)</CardTitle>
        </CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="in" stroke="var(--color-success)" strokeWidth={2} name="Masuk" />
              <Line type="monotone" dataKey="out" stroke="var(--color-primary)" strokeWidth={2} name="Keluar" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Status Stok Produk</CardTitle>
          <Input placeholder="Cari produk atau SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kadaluarsa Terdekat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 50).map((r) => {
                const s = statusOf(r);
                return (
                  <TableRow key={r.product_id}>
                    <TableCell className="font-medium">{r.product_name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.sku}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.total_stock.toLocaleString("id-ID")}</TableCell>
                    <TableCell>
                      <Badge variant={s.variant === "success" ? "outline" : "default"}
                        className={
                          s.variant === "destructive" ? "bg-destructive/10 text-destructive border-destructive/30" :
                          s.variant === "warning" ? "bg-warning/15 text-warning-foreground border-warning/40" :
                          "bg-success/15 text-success-foreground border-success/40"
                        }>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.earliest_expiry ?? "-"}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Tidak ada produk.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number | string; tone?: "destructive" | "warning";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${
          tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning-foreground" : ""
        }`}>{value}</div>
      </CardContent>
    </Card>
  );
}

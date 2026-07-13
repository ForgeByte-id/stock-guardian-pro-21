import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/movements/")({
  component: MovementsHistoryPage,
});

type Row = {
  id: string;
  created_at: string;
  direction: string;
  quantity: number;
  stock_before: number;
  stock_after: number;
  notes: string | null;
  batch: { batch_number: string; products: { name: string; sku: string | null } | null } | null;
  reason: { name: string; code: string } | null;
  channel: { code: string; name: string } | null;
  order_id: string | null;
};

function MovementsHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [dir, setDir] = useState<string>("all");
  const [reasons, setReasons] = useState<{ code: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ code: string; name: string }[]>([]);
  const [reasonCode, setReasonCode] = useState("all");
  const [channelCode, setChannelCode] = useState("all");

  useEffect(() => { void load(); }, [dir, reasonCode, channelCode]);
  useEffect(() => {
    void (async () => {
      const [r, c] = await Promise.all([
        supabase.from("movement_reasons").select("code,name").order("name"),
        supabase.from("channels").select("code,name"),
      ]);
      setReasons(r.data ?? []); setChannels(c.data ?? []);
    })();
  }, []);

  async function load() {
    let q = supabase.from("stock_ledger")
      .select(`id,created_at,direction,quantity,stock_before,stock_after,notes,order_id,
        batch:batch_id(batch_number, products:product_id(name, sku)),
        reason:reason_id(name, code),
        channel:channel_id(code, name)`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (dir !== "all") q = q.eq("direction", dir);
    const { data } = await q;
    let list = (data ?? []) as unknown as Row[];
    if (reasonCode !== "all") list = list.filter((r) => r.reason?.code === reasonCode);
    if (channelCode !== "all") list = list.filter((r) => r.channel?.code === channelCode);
    setRows(list);
  }

  const filtered = rows.filter(
    (r) => (r.batch?.products?.name.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (r.batch?.batch_number.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  function exportCsv() {
    const header = ["Waktu", "Produk", "Batch", "Arah", "Jumlah", "Stok Sebelum", "Stok Sesudah", "Alasan", "Kanal", "Order", "Catatan"];
    const lines = [header.join(",")];
    filtered.forEach((r) => {
      lines.push([
        r.created_at, r.batch?.products?.name ?? "", r.batch?.batch_number ?? "",
        r.direction, r.quantity, r.stock_before, r.stock_after,
        r.reason?.name ?? "", r.channel?.name ?? "", r.order_id ?? "", (r.notes ?? "").replace(/,/g, ";"),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `jurnal-stok-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Riwayat Jurnal Stok</h1>
          <p className="text-sm text-muted-foreground">Buku besar pergerakan stok — append-only, tidak dapat diedit.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
          <Button asChild><Link to="/movements/new"><Plus className="mr-2 h-4 w-4" />Catat Pergerakan</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap gap-2 space-y-0">
          <Input placeholder="Cari produk/batch…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={dir} onValueChange={setDir}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Arah" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua arah</SelectItem>
              <SelectItem value="in">Masuk</SelectItem>
              <SelectItem value="out">Keluar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Alasan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua alasan</SelectItem>
              {reasons.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channelCode} onValueChange={setChannelCode}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Kanal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kanal</SelectItem>
              {channels.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Produk / Batch</TableHead>
                <TableHead>Arah</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Sebelum → Sesudah</TableHead>
                <TableHead>Alasan</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead>Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{r.batch?.products?.name ?? "-"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.batch?.batch_number ?? ""}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.direction === "in"
                      ? "bg-success/15 text-success-foreground border-success/40"
                      : "bg-primary/15 text-primary border-primary/40"}>
                      {r.direction === "in" ? "MASUK" : "KELUAR"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{r.stock_before} → {r.stock_after}</TableCell>
                  <TableCell className="text-xs">{r.reason?.name}</TableCell>
                  <TableCell className="text-xs">{r.channel?.name ?? "-"}</TableCell>
                  <TableCell className="text-xs font-mono">{r.order_id ? r.order_id.slice(0, 8) : "-"}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Belum ada pergerakan.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

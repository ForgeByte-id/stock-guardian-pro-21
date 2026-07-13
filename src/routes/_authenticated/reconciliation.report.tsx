import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/reconciliation/report")({
  component: ReportPage,
});

type Ledger = {
  id: string; created_at: string; direction: string; quantity: number;
  batch: { batch_number: string; products: { name: string } | null } | null;
  reason: { name: string; code: string } | null;
  channel: { code: string; name: string } | null;
};

function ReportPage() {
  const [range, setRange] = useState("30");
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [drill, setDrill] = useState<Ledger[] | null>(null);
  const [drillTitle, setDrillTitle] = useState("");

  useEffect(() => { void load(); }, [range]);
  async function load() {
    const since = new Date(Date.now() - Number(range) * 86400000).toISOString();
    const { data } = await supabase.from("stock_ledger")
      .select(`id,created_at,direction,quantity,
        batch:batch_id(batch_number, products:product_id(name)),
        reason:reason_id(name, code),
        channel:channel_id(code, name)`)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
    setLedger((data ?? []) as unknown as Ledger[]);
  }

  const byReason = groupBy(ledger, (l) => l.reason?.name ?? "Lain");
  const byChannel = groupBy(ledger, (l) => l.channel?.name ?? "Manual");
  const reasonData = [...byReason.entries()].map(([k, v]) => ({
    name: k, keluar: v.filter((l) => l.direction === "out").reduce((s, l) => s + l.quantity, 0),
  }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Laporan Selisih & Pergerakan</h1>
          <p className="text-sm text-muted-foreground">Drill-down transaksi berdasarkan alasan dan kanal.</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 Hari</SelectItem>
            <SelectItem value="30">30 Hari</SelectItem>
            <SelectItem value="90">90 Hari</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Distribusi Pengeluaran per Alasan</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer>
            <BarChart data={reasonData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" fontSize={11} angle={-15} textAnchor="end" height={60} interval={0} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Bar dataKey="keluar" fill="var(--color-primary)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Per Alasan</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Alasan</TableHead><TableHead className="text-right">Transaksi</TableHead><TableHead className="text-right">Unit</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...byReason.entries()].map(([k, v]) => (
                  <TableRow key={k} className="cursor-pointer hover:bg-muted/40" onClick={() => { setDrill(v); setDrillTitle(`Alasan: ${k}`); }}>
                    <TableCell>{k}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.reduce((s, l) => s + l.quantity, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Per Kanal</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Kanal</TableHead><TableHead className="text-right">Transaksi</TableHead><TableHead className="text-right">Unit</TableHead></TableRow></TableHeader>
              <TableBody>
                {[...byChannel.entries()].map(([k, v]) => (
                  <TableRow key={k} className="cursor-pointer hover:bg-muted/40" onClick={() => { setDrill(v); setDrillTitle(`Kanal: ${k}`); }}>
                    <TableCell>{k}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.reduce((s, l) => s + l.quantity, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{drillTitle}</DialogTitle></DialogHeader>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Produk / Batch</TableHead><TableHead>Arah</TableHead><TableHead className="text-right">Jumlah</TableHead></TableRow></TableHeader>
              <TableBody>
                {drill?.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("id-ID")}</TableCell>
                    <TableCell>
                      <div className="text-sm">{l.batch?.products?.name}</div>
                      <div className="text-[11px] text-muted-foreground">{l.batch?.batch_number}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{l.direction}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={() => setDrill(null)}>Tutup</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function groupBy<T>(arr: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>();
  arr.forEach((v) => { const k = key(v); if (!m.has(k)) m.set(k, []); m.get(k)!.push(v); });
  return m;
}

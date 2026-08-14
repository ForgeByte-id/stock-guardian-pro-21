import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reconciliation/daily")({
  component: DailyReconPage,
});

type Anomaly = {
  batch_id: string; product_name: string; batch_number: string;
  expected_stock: number; recorded_stock: number; diff: number;
};

function DailyReconPage() {
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const run = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("stock_balance_consistency_check");
    setBusy(false);
    if (error) return toast.error(error.message);
    setRows((data as unknown as Anomaly[]) ?? []);
    setLastRun(new Date());
  };

  useEffect(() => { void run(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cek Konsistensi Harian</h1>
          <p className="text-sm text-muted-foreground">
            Membandingkan saldo ringkasan dengan rekomputasi dari <code>stock_ledger</code>.
          </p>
        </div>
        <Button onClick={run} disabled={busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          Jalankan Sekarang
        </Button>
      </div>

      {rows.length === 0 ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertTitle>Semua konsisten</AlertTitle>
          <AlertDescription>
            Tidak ada selisih antara stok tercatat dan rekomputasi buku besar. {lastRun && `Dijalankan ${lastRun.toLocaleString("id-ID")}.`}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{rows.length} anomali ditemukan</AlertTitle>
          <AlertDescription>Batch di bawah memiliki selisih. Lakukan opname untuk merekonsiliasi.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Batch dengan Selisih</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Rekomputasi Ledger</TableHead>
                <TableHead className="text-right">Tercatat</TableHead>
                <TableHead className="text-right">Selisih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.batch_id}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell className="text-xs">{r.batch_number}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.expected_stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.recorded_stock}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${r.diff < 0 ? "text-destructive" : "text-warning-foreground"}`}>
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Tidak ada anomali.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

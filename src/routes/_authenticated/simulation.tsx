import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { simulationMarketplace } from "@/lib/marketplace/simulation-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/simulation")({
  component: SimulationPage,
});

type Order = {
  id: string; order_number: string; status: string; created_at: string;
  shipped_at: string | null; cancelled_at: string | null;
  channel: { code: string; name: string } | null;
};

function SimulationPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => { void load(); }, []);
  async function load() {
    const { data } = await supabase.from("orders")
      .select("id,order_number,status,created_at,shipped_at,cancelled_at,channel:channel_id(code,name)")
      .order("created_at", { ascending: false }).limit(50);
    setOrders((data ?? []) as unknown as Order[]);
  }

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); toast.success(msg); await load(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Simulasi Pesanan</h1>
        <p className="text-sm text-muted-foreground">
          Tombol dummy Shopee & TikTok Shop. Stok hanya berkurang saat status berpindah ke SHIPPED (alokasi otomatis FEFO).
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(["SHOPEE", "TIKTOK"] as const).map((ch) => (
          <Card key={ch}>
            <CardHeader><CardTitle className="text-base">{ch === "SHOPEE" ? "Shopee" : "TikTok Shop"}</CardTitle></CardHeader>
            <CardContent>
              <Button disabled={busy} onClick={() => act(async () => {
                await simulationMarketplace.createOrder(ch);
              }, `Order ${ch} dibuat (RESERVED).`)}>
                + Buat Pesanan
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Daftar Pesanan Terbaru</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                  <TableCell>{o.channel?.name}</TableCell>
                  <TableCell><StatusBadge s={o.status} ch={o.channel?.code} /></TableCell>
                  <TableCell className="text-xs">{new Date(o.created_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {o.status === "RESERVED" && (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => act(
                          () => simulationMarketplace.shipOrder(o.id),
                          "Order dikirim — stok dipotong (FEFO)."
                        )}>Kirim</Button>
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => { setCancelOrder(o); setCancelReason(""); }}>Batal</Button>
                      </>
                    )}
                    {o.status === "SHIPPED" && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => { setCancelOrder(o); setCancelReason(""); }}>Batal</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(async () => {
                          const { return_id } = await simulationMarketplace.receiveReturn(o.id);
                          window.location.href = `/returns/${return_id}/inspect`;
                        }, "Retur diterima — silakan inspeksi.")}>Retur</Button>
                      </>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/movements" search={{}}>Ledger</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Belum ada pesanan.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan Pesanan {cancelOrder?.order_number}</DialogTitle>
            <DialogDescription>
              {cancelOrder?.status === "SHIPPED"
                ? "Order sudah SHIPPED — stok akan dikembalikan ke batch asal lewat entri ledger IN (reason: cancellation)."
                : "Order masih RESERVED — tidak ada entri ledger yang ditulis (stok belum berkurang)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Alasan Pembatalan</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="mis. Pembeli batal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOrder(null)}>Tutup</Button>
            <Button disabled={busy || !cancelReason} onClick={() => {
              if (!cancelOrder) return;
              const o = cancelOrder;
              setCancelOrder(null);
              return act(() => simulationMarketplace.cancelOrder(o.id, cancelReason), "Pesanan dibatalkan.");
            }}>Batalkan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ s, ch }: { s: string; ch?: string }) {
  const label = s === "SHIPPED" && ch === "TIKTOK" ? "IN_TRANSIT" : s;
  const cls =
    s === "RESERVED" ? "bg-info/15 text-info-foreground border-info/40" :
    s === "SHIPPED" ? "bg-primary/15 text-primary border-primary/40" :
    s === "CANCELLED" ? "bg-muted text-muted-foreground" :
    s === "RETURNED" ? "bg-warning/15 text-warning-foreground border-warning/40" : "";
  return <Badge variant="outline" className={cls}>{label}</Badge>;
}

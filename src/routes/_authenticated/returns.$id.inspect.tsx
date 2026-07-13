import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertTriangle, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/returns/$id/inspect")({
  component: ReturnInspectPage,
});

type ReturnRow = {
  id: string; return_date: string; condition: string;
  claim_deadline: string | null; claim_status: string; notes: string | null;
  order: {
    id: string; order_number: string; status: string;
    channel: { code: string; name: string } | null;
    order_items: { product_id: string; quantity: number; batch_id: string | null;
      products: { name: string } | null }[];
  } | null;
};

function ReturnInspectPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [row, setRow] = useState<ReturnRow | null>(null);
  const [condition, setCondition] = useState<"RESALABLE" | "DAMAGED" | "LOST">("RESALABLE");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void load(); }, [id]);
  async function load() {
    const { data } = await supabase.from("returns")
      .select(`id, return_date, condition, claim_deadline, claim_status, notes,
        order:order_id(id, order_number, status,
          channel:channel_id(code, name),
          order_items(product_id, quantity, batch_id, products:product_id(name)))`)
      .eq("id", id).maybeSingle();
    setRow(data as unknown as ReturnRow);
    if (data?.notes) setNotes(data.notes);
  }

  async function submit() {
    setBusy(true);
    const { error } = await supabase.rpc("process_return", {
      p_return_id: id, p_condition: condition, p_notes: notes || undefined,
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Inspeksi retur tersimpan.");
    navigate({ to: "/simulation" });
  }

  if (!row) return <div className="text-sm text-muted-foreground">Memuat…</div>;

  const daysLeft = row.claim_deadline
    ? Math.ceil((new Date(row.claim_deadline).getTime() - Date.now()) / 86400000) : null;
  const urgent = daysLeft !== null && daysLeft < 7;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inspeksi Retur</h1>
        <p className="text-sm text-muted-foreground">
          Order {row.order?.order_number} · {row.order?.channel?.name} · Tanggal retur {row.return_date}
        </p>
      </div>

      {row.claim_deadline && (
        <Alert variant={urgent ? "destructive" : "default"}>
          <Timer className="h-4 w-4" />
          <AlertTitle>Klaim ke Marketplace</AlertTitle>
          <AlertDescription>
            Batas klaim: <b>{row.claim_deadline}</b> ({daysLeft} hari lagi) — status {row.claim_status}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Item Pesanan</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          {row.order?.order_items.map((it, i) => (
            <div key={i} className="flex justify-between border-b py-1">
              <span>{it.products?.name ?? it.product_id}</span>
              <span className="tabular-nums">{it.quantity}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kondisi Barang Retur</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={condition} onValueChange={(v) => setCondition(v as typeof condition)}>
            <div className="space-y-2">
              <Option v="RESALABLE" title="Layak Jual"
                desc="Barang kembali dalam kondisi baik. Stok akan dikembalikan ke batch asal (entri ledger IN)." />
              <Option v="DAMAGED" title="Rusak"
                desc="Barang tidak layak jual. Stok TIDAK ditambahkan kembali." />
              <Option v="LOST" title="Hilang di Ekspedisi"
                desc="Barang tidak pernah kembali. Stok TIDAK ditambahkan. Untuk TikTok, deadline klaim otomatis 40 hari." />
            </div>
          </RadioGroup>

          <div className="space-y-1.5">
            <Label>Catatan Inspeksi</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {condition !== "RESALABLE" && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Kondisi ini TIDAK menambah stok kembali — barang tetap hilang dari stok layak jual sejak SHIPPED.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/simulation" })}>Batal</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Menyimpan…" : "Simpan Inspeksi"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Option({ v, title, desc }: { v: string; title: string; desc: string }) {
  return (
    <label htmlFor={v} className="flex gap-3 items-start rounded-md border p-3 cursor-pointer hover:bg-muted/40">
      <RadioGroupItem value={v} id={v} className="mt-1" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

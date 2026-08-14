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
  const [isResalable, setIsResalable] = useState(true);
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
          Order {row.order?.order_number} · Channel {row.order?.channel?.name} · Retur diajukan {row.return_date}
        </p>
      </div>

      {row.claim_deadline && (
        <Alert variant={urgent ? "destructive" : "default"}>
          <Timer className="h-4 w-4" />
          <AlertTitle>Batas klaim ke Marketplace</AlertTitle>
          <AlertDescription>
            Ajukan klaim sebelum <b>{row.claim_deadline}</b> ({daysLeft} hari lagi). Status klaim: {row.claim_status}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Item pesanan yang dikembalikan</CardTitle></CardHeader>
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
        <CardHeader><CardTitle className="text-base">Tentukan kondisi barang retur</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={condition} onValueChange={(v) => { setCondition(v as typeof condition); setIsResalable(v === "RESALABLE"); }}>
            <div className="space-y-2">
              <Option v="RESALABLE" title="Layak jual"
                desc="Barang kembali dalam kondisi baik. Stok masuk ke BATCH BARU (origin = retur), bukan batch asal." />
              <Option v="DAMAGED" title="Rusak"
                desc="Barang tidak layak jual. Tidak ada pergerakan stok kedua di Stock Ledger; stok sudah terpotong saat SHIPPED." />
              <Option v="LOST" title="Hilang di ekspedisi"
                desc="Barang tidak kembali dari ekspedisi. Tidak ada pergerakan stok kedua di Stock Ledger; stok sudah terpotong saat SHIPPED. Untuk TikTok, batas klaim dihitung 40 hari sejak retur diajukan." />
            </div>
          </RadioGroup>

          <div className="space-y-1.5">
            <Label>Catatan inspeksi (opsional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {condition === "RESALABLE" && (
            <Alert>
              <AlertDescription className="text-xs">
                Stok akan masuk ke batch BARU dengan origin = retur — bukan ke batch asal.
              </AlertDescription>
            </Alert>
          )}
          {!isResalable && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Tidak ada stok yang ditambahkan dan tidak ada pergerakan Stock Ledger kedua. Stok sudah terpotong saat SHIPPED. {condition === "DAMAGED" ? "Klaim kerusakan" : "Klaim hilang"} tercatat di worklist klaim.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/simulation" })}>Batal</Button>
            <Button onClick={submit} disabled={busy}>{busy ? "Menyimpan hasil inspeksi…" : "Simpan hasil inspeksi"}</Button>
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

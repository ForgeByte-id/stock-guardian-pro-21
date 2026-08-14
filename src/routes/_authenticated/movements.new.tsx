import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/movements/new")({
  component: MovementNewPage,
});

const schema = z.object({
  movement_type: z.enum(["IN", "OUT"]),
  reason_code: z.string().min(1),
  product_id: z.string().uuid(),
  channel_code: z.string().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().max(500).optional(),
  reference_note: z.string().max(500).optional(),
});

type Product = { id: string; name: string; sku: string | null };
type Reason = { code: string; name: string; direction: "in" | "out" };
type Channel = { code: string; name: string };

function MovementNewPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const [movementType, setMovementType] = useState<"IN" | "OUT">("IN");
  const [reasonCode, setReasonCode] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [channelCode, setChannelCode] = useState<string>("none");
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const needsReference = ["bonus", "promo", "sample"].includes(reasonCode);

  useEffect(() => { void init(); }, []);
  async function init() {
    const [p, r, c] = await Promise.all([
      supabase.from("products").select("id,name,sku").eq("is_active", true).order("name"),
      supabase.from("movement_reasons").select("code,name,direction").eq("is_active", true).order("name"),
      supabase.from("channels").select("code,name").eq("is_active", true),
    ]);
    setProducts(p.data ?? []); setReasons((r.data ?? []) as Reason[]); setChannels(c.data ?? []);
  }

  const filteredReasons = useMemo(
    () => reasons.filter((r) => r.direction === (movementType === "IN" ? "in" : "out")),
    [reasons, movementType]
  );

  useEffect(() => {
    if (!filteredReasons.find((r) => r.code === reasonCode)) {
      setReasonCode(filteredReasons[0]?.code ?? "");
      setReferenceNote("");
    }
  }, [filteredReasons, reasonCode]);

  const selectedProduct = products.find((p) => p.id === productId);
  const selectedReason = reasons.find((r) => r.code === reasonCode);

  function validate() {
    if (!productId) { toast.error("Pilih produk / SKU."); return false; }
    if (!reasonCode) { toast.error("Pilih Reason (alasan pergerakan)."); return false; }
    if (quantity < 1) { toast.error("Jumlah minimal 1 unit."); return false; }
    if (needsReference && !referenceNote.trim()) {
      toast.error("Referensi wajib diisi untuk Reason bonus, promo, atau sample (nama campaign atau catatan approval).");
      return false;
    }
    const parsed = schema.safeParse({
      movement_type: movementType, reason_code: reasonCode, product_id: productId,
      channel_code: channelCode === "none" ? undefined : channelCode,
      quantity, notes: notes || undefined, reference_note: referenceNote || undefined,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Periksa kembali data pergerakan."); return false; }
    return true;
  }

  async function submit() {
    setSubmitting(true);
    const sourceType = movementType === "IN" ? "goods_in_maklon" : "manual_out";
    const { error } = await supabase.rpc("record_stock_movement", {
      p_batch_id: null, // will use FEFO for OUT, or require batch for IN
      p_movement_type: movementType,
      p_reason_code: reasonCode,
      p_channel_code: channelCode === "none" ? undefined : channelCode,
      p_quantity: quantity,
      p_notes: notes || undefined,
      p_source_type: sourceType,
      p_reference_note: referenceNote || undefined,
    } as never);
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pergerakan stok tercatat di Stock Ledger.");
    navigate({ to: "/movements" });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Catat pergerakan stok</h1>
        <p className="text-sm text-muted-foreground">Setiap perubahan stok tercatat di Stock Ledger, buku besar yang hanya bisa ditambah—bukan diubah atau dihapus.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Form input cepat pergerakan stok</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Tipe pergerakan (IN / OUT)">
            <Select value={movementType} onValueChange={(v: "IN" | "OUT") => setMovementType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">Barang masuk (IN)</SelectItem>
                <SelectItem value="OUT">Barang keluar (OUT)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reason (alasan pergerakan)">
            <Select value={reasonCode} onValueChange={(v) => { setReasonCode(v); setReferenceNote(""); }}>
              <SelectTrigger><SelectValue placeholder="Pilih Reason" /></SelectTrigger>
              <SelectContent>
                {filteredReasons.map((r) => <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Produk / SKU">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Pilih produk / SKU" /></SelectTrigger>
              <SelectContent className="max-h-80">
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Channel (kanal, opsional)">
            <Select value={channelCode} onValueChange={setChannelCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Tidak ada —</SelectItem>
                {channels.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Jumlah unit">
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </Field>
          {needsReference && (
            <Field label="Referensi (wajib untuk Reason ini)">
              <Input
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder="Nama campaign atau catatan approval"
              />
            </Field>
          )}
          <div className="md:col-span-2">
            <Field label="Catatan tambahan (opsional)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
            </Field>
          </div>
          <div className="md:col-span-2 text-xs text-muted-foreground">
            {movementType === "OUT"
              ? "Untuk OUT, Batch dipilih otomatis dengan FEFO (First Expired, First Out): Batch dengan kedaluwarsa terdekat dipakai lebih dulu."
              : "Untuk IN, Batch dibuat otomatis setelah entri tersimpan."}
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/movements" })}>Batal</Button>
            <Button onClick={() => { if (validate()) setConfirmOpen(true); }}>Tinjau lalu simpan</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi pergerakan stok</DialogTitle>
            <DialogDescription>Simpan akan menambah entri ke Stock Ledger. Entri ini tidak dapat diubah atau dihapus.</DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-1">
            <Row k="Tipe (IN / OUT)" v={movementType === "IN" ? "Barang masuk (IN)" : "Barang keluar (OUT)"} />
            <Row k="Reason" v={selectedReason?.name ?? ""} />
            <Row k="Produk / SKU" v={selectedProduct?.name ?? ""} />
            <Row k="Jumlah unit" v={quantity.toLocaleString("id-ID")} />
            <Row k="Channel" v={channelCode === "none" ? "-" : channelCode} />
            {needsReference && <Row k="Referensi" v={referenceNote} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between border-b py-1"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}

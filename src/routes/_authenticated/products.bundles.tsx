import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Info, PackageOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products/bundles")({
  component: BundlesPage,
});

type Bundle = { id: string; name: string; marketplace_listing: string | null; channel_id: string | null; is_active: boolean };
type Item = { id: string; bundle_id: string; product_id: string; quantity: number };

function BundlesPage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Partial<Bundle> & { items?: { product_id: string; quantity: number }[] } | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    const [b, i, p, c] = await Promise.all([
      supabase.from("bundles").select("*"),
      supabase.from("bundle_items").select("*"),
      supabase.from("products").select("id,name").eq("is_active", true).order("name"),
      supabase.from("channels").select("id,name"),
    ]);
    setBundles(b.data ?? []); setItems(i.data ?? []); setProducts(p.data ?? []); setChannels(c.data ?? []);
  }

  async function saveBundle() {
    if (!editing?.name) return toast.error("Nama bundle wajib diisi");
    const its = (editing.items ?? []).filter((x) => x.product_id && x.quantity > 0);
    if (its.length === 0) return toast.error("Tambahkan minimal satu komponen produk");
    const { data, error } = await supabase.from("bundles").insert({
      name: editing.name, marketplace_listing: editing.marketplace_listing ?? null,
      channel_id: editing.channel_id ?? null,
    }).select().single();
    if (error || !data) return toast.error(error?.message ?? "Bundle gagal disimpan");
    await supabase.from("bundle_items").insert(its.map((x) => ({
      bundle_id: data.id, product_id: x.product_id, quantity: x.quantity,
    })));
    setEditing(null); toast.success("Bundle berhasil disimpan."); load();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div data-tour="bundles-header" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resep bundle</h1>
          <p className="text-sm text-muted-foreground">
            Satu SKU marketplace dapat terdiri dari beberapa produk maklon. Saat status SHIPPED, bundle dipecah otomatis dan stok setiap komponen dicatat terpisah di Stock Ledger. Resep di-versioning, jadi order lama tetap memakai versi saat order dibuat.
          </p>
        </div>
        <Button data-tour="bundles-add" onClick={() => setEditing({ items: [{ product_id: "", quantity: 1 }] })}>
          <Plus className="mr-2 h-4 w-4" />Tambah bundle
        </Button>
      </div>

      {/* Info banner */}
      <Alert data-tour="bundles-info" className="bg-info/10 border-info/30 text-info-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <AlertDescription className="text-xs">
          <strong className="font-semibold">Contoh:</strong> Listing marketplace "Paket Sabun&Sampo" terdiri dari dua produk maklon berbeda.
          Buat bundle. Saat order masuk dan status berubah menjadi <strong>SHIPPED</strong>, sistem memecahnya menjadi komponen lalu mengurangi stok Sabun −1 dan Sampo −1 di Stock Ledger.
        </AlertDescription>
      </Alert>

      {/* Bundle list */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead data-tour="bundles-col-name">Nama bundle</TableHead>
                <TableHead data-tour="bundles-col-sku">Listing marketplace (SKU)</TableHead>
                <TableHead data-tour="bundles-col-components">Komponen produk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bundles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-12 text-muted-foreground">
                    <PackageOpen className="mx-auto h-8 w-8 mb-3 opacity-30" />
                    <p className="font-medium">Belum ada bundle</p>
                    <p className="text-xs mt-1 max-w-md mx-auto">
                      Bundle adalah satu produk marketplace yang terdiri dari beberapa produk maklon.
                      Contoh: "Paket Hadiah Lebaran" berisi Sabun + Sampo + Lulur. Resep yang dipakai order lama tetap mengikuti versi saat order dibuat.
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing({ items: [{ product_id: "", quantity: 1 }] })}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />Buat bundle pertama
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                bundles.map((b) => {
                  const its = items.filter((i) => i.bundle_id === b.id);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{b.marketplace_listing ?? <span className="italic">—</span>}</TableCell>
                      <TableCell className="text-xs">
                        {its.map((i) => {
                          const p = products.find((x) => x.id === i.product_id);
                          return `${p?.name ?? i.product_id} × ${i.quantity}`;
                        }).join(" · ")}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Dialog: Add Bundle ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tambah bundle</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div data-tour="bundles-form-name" className="space-y-1.5">
              <Label>Nama bundle</Label>
              <Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Paket Sabun & Sampo" />
              <p className="text-xs text-muted-foreground">Nama yang dipakai di sistem untuk mengenali bundle ini.</p>
            </div>
            <div data-tour="bundles-form-sku" className="space-y-1.5">
              <Label>Listing marketplace (SKU)</Label>
              <Input value={editing?.marketplace_listing ?? ""}
                onChange={(e) => setEditing({ ...editing, marketplace_listing: e.target.value })}
                placeholder="Sabun Sampo 500ml — 1 pack" />
              <p className="text-xs text-muted-foreground">Nama produk seperti yang tampil di marketplace. Kosongkan jika sama dengan nama bundle.</p>
            </div>
            <div data-tour="bundles-form-channel" className="space-y-1.5">
              <Label>Channel (opsional)</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm bg-background"
                value={editing?.channel_id ?? ""}
                onChange={(e) => setEditing({ ...editing, channel_id: e.target.value || null })}>
                <option value="">Semua channel</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Pakai jika bundle hanya berlaku di channel tertentu. Pilih "Semua channel" jika berlaku di semua marketplace.</p>
            </div>
            <div data-tour="bundles-form-components" className="space-y-2">
              <Label>Komponen produk</Label>
              <p className="text-xs text-muted-foreground -mt-1">Pilih produk maklon dan jumlah unit per bundle. Saat bundle berstatus SHIPPED, stok komponen berkurang sesuai resep.</p>
              {editing?.items?.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <select className="flex-1 border rounded-md h-9 px-2 text-sm bg-background" value={it.product_id}
                    onChange={(e) => {
                      const items = [...(editing.items ?? [])];
                      items[idx] = { ...items[idx], product_id: e.target.value };
                      setEditing({ ...editing, items });
                    }}>
                    <option value="">— Pilih produk —</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Input type="number" min={1} value={it.quantity} className="w-24"
                    onChange={(e) => {
                      const items = [...(editing.items ?? [])];
                      items[idx] = { ...items[idx], quantity: Number(e.target.value) };
                      setEditing({ ...editing, items });
                    }} />
                  <Button size="icon" variant="ghost" onClick={() => {
                    const items = (editing.items ?? []).filter((_, i) => i !== idx);
                    setEditing({ ...editing, items });
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() =>
                setEditing({ ...editing, items: [...(editing?.items ?? []), { product_id: "", quantity: 1 }] })}>
                <Plus className="mr-1 h-4 w-4" />Tambah komponen
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={saveBundle}>Simpan bundle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

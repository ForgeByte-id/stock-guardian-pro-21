import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useCurrentRole } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/products/bundles")({
  component: BundlesPage,
});

type Bundle = { id: string; name: string; marketplace_listing: string | null; channel_id: string | null; is_active: boolean };
type Item = { id: string; bundle_id: string; product_id: string; quantity: number };

function BundlesPage() {
  const { isAdmin } = useCurrentRole();
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
    if (!editing?.name) return toast.error("Nama bundle wajib");
    const its = (editing.items ?? []).filter((x) => x.product_id && x.quantity > 0);
    if (its.length === 0) return toast.error("Minimal 1 komponen");
    const { data, error } = await supabase.from("bundles").insert({
      name: editing.name, marketplace_listing: editing.marketplace_listing ?? null,
      channel_id: editing.channel_id ?? null,
    }).select().single();
    if (error || !data) return toast.error(error?.message ?? "Gagal");
    await supabase.from("bundle_items").insert(its.map((x) => ({
      bundle_id: data.id, product_id: x.product_id, quantity: x.quantity,
    })));
    setEditing(null); toast.success("Bundle disimpan."); load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resep Bundle</h1>
          <p className="text-sm text-muted-foreground">Bundle otomatis dipecah jadi komponen saat SHIPPED (ledger per komponen).</p>
        </div>
        {isAdmin && <Button onClick={() => setEditing({ items: [{ product_id: "", quantity: 1 }] })}><Plus className="mr-2 h-4 w-4" />Bundle Baru</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Marketplace</TableHead><TableHead>Komponen</TableHead></TableRow></TableHeader>
            <TableBody>
              {bundles.map((b) => {
                const its = items.filter((i) => i.bundle_id === b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-xs">{b.marketplace_listing ?? "-"}</TableCell>
                    <TableCell className="text-xs">
                      {its.map((i) => {
                        const p = products.find((x) => x.id === i.product_id);
                        return `${p?.name ?? i.product_id} × ${i.quantity}`;
                      }).join(" · ")}
                    </TableCell>
                  </TableRow>
                );
              })}
              {bundles.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Belum ada bundle.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bundle Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama Bundle</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Marketplace Listing (opsional)</Label><Input value={editing?.marketplace_listing ?? ""} onChange={(e) => setEditing({ ...editing, marketplace_listing: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Kanal (opsional)</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm bg-background" value={editing?.channel_id ?? ""} onChange={(e) => setEditing({ ...editing, channel_id: e.target.value || null })}>
                <option value="">-</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Komponen</Label>
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
                <Plus className="mr-1 h-4 w-4" />Tambah Komponen
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={saveBundle}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

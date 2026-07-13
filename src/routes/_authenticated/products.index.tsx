import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useCurrentRole } from "@/hooks/use-role";

export const Route = createFileRoute("/_authenticated/products/")({
  component: ProductsPage,
});

type Product = { id: string; name: string; sku: string | null; category: string | null; low_stock_threshold: number; critical_stock_threshold: number; is_active: boolean };
type Batch = { id: string; product_id: string; batch_number: string; production_date: string; expiry_date: string; initial_stock: number; current_stock: number; is_active: boolean };

function ProductsPage() {
  const { isAdmin } = useCurrentRole();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [newProduct, setNewProduct] = useState<Partial<Product> | null>(null);
  const [newBatch, setNewBatch] = useState<Partial<Batch> | null>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    const [p, b] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("batches").select("*").order("expiry_date"),
    ]);
    setProducts(p.data ?? []); setBatches(b.data ?? []);
  }

  async function saveProduct() {
    if (!newProduct?.name) return toast.error("Nama wajib");
    const { error } = await supabase.from("products").insert({
      name: newProduct.name, sku: newProduct.sku ?? null, category: newProduct.category ?? null,
      low_stock_threshold: Number(newProduct.low_stock_threshold ?? 100),
      critical_stock_threshold: Number(newProduct.critical_stock_threshold ?? 50),
    });
    if (error) return toast.error(error.message);
    toast.success("Produk dibuat."); setNewProduct(null); load();
  }

  async function saveBatch() {
    if (!newBatch?.product_id || !newBatch.batch_number || !newBatch.production_date || !newBatch.expiry_date)
      return toast.error("Lengkapi semua kolom");
    const init = Number(newBatch.initial_stock ?? 0);
    const { error } = await supabase.from("batches").insert({
      product_id: newBatch.product_id, batch_number: newBatch.batch_number,
      production_date: newBatch.production_date, expiry_date: newBatch.expiry_date,
      initial_stock: init, current_stock: init,
    });
    if (error) return toast.error(error.message);
    toast.success("Batch dibuat."); setNewBatch(null); load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Produk & Batch</h1>
        <p className="text-sm text-muted-foreground">Data master produk skincare dan batch (nomor + kadaluarsa).</p>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Produk ({products.length})</TabsTrigger>
          <TabsTrigger value="batches">Batch ({batches.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader className="flex-row justify-between items-center space-y-0">
              <CardTitle className="text-base">Daftar Produk</CardTitle>
              {isAdmin && <Button size="sm" onClick={() => setNewProduct({})}><Plus className="mr-1 h-4 w-4" />Produk</Button>}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nama</TableHead><TableHead>SKU</TableHead><TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Threshold (Peringatan / Kritis)</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.sku}</TableCell>
                      <TableCell className="text-xs">{p.category}</TableCell>
                      <TableCell className="text-right text-xs">{p.low_stock_threshold} / {p.critical_stock_threshold}</TableCell>
                      <TableCell>{p.is_active ? <Badge>Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="batches">
          <Card>
            <CardHeader className="flex-row justify-between items-center space-y-0">
              <CardTitle className="text-base">Daftar Batch</CardTitle>
              {isAdmin && <Button size="sm" onClick={() => setNewBatch({})}><Plus className="mr-1 h-4 w-4" />Batch</Button>}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Produk</TableHead><TableHead>Batch</TableHead><TableHead>Produksi</TableHead>
                  <TableHead>Kadaluarsa</TableHead><TableHead className="text-right">Stok</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {batches.map((b) => {
                    const p = products.find((x) => x.id === b.product_id);
                    const days = (new Date(b.expiry_date).getTime() - Date.now()) / 86400000;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm">{p?.name}</TableCell>
                        <TableCell className="font-mono text-xs">{b.batch_number}</TableCell>
                        <TableCell className="text-xs">{b.production_date}</TableCell>
                        <TableCell className="text-xs">
                          {b.expiry_date}
                          {days < 90 && <Badge variant="outline" className="ml-2 bg-warning/15 text-warning-foreground border-warning/40">&lt;{Math.floor(days)}d</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{b.current_stock}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!newProduct} onOpenChange={(o) => !o && setNewProduct(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Produk Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama</Label><Input value={newProduct?.name ?? ""} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>SKU</Label><Input value={newProduct?.sku ?? ""} onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Kategori</Label><Input value={newProduct?.category ?? ""} onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Threshold Peringatan</Label><Input type="number" value={newProduct?.low_stock_threshold ?? 100} onChange={(e) => setNewProduct({ ...newProduct, low_stock_threshold: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Threshold Kritis</Label><Input type="number" value={newProduct?.critical_stock_threshold ?? 50} onChange={(e) => setNewProduct({ ...newProduct, critical_stock_threshold: Number(e.target.value) })} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewProduct(null)}>Batal</Button><Button onClick={saveProduct}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newBatch} onOpenChange={(o) => !o && setNewBatch(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Batch Baru</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Produk</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm bg-background" value={newBatch?.product_id ?? ""} onChange={(e) => setNewBatch({ ...newBatch, product_id: e.target.value })}>
                <option value="">— Pilih —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Nomor Batch</Label><Input value={newBatch?.batch_number ?? ""} onChange={(e) => setNewBatch({ ...newBatch, batch_number: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Tanggal Produksi</Label><Input type="date" value={newBatch?.production_date ?? ""} onChange={(e) => setNewBatch({ ...newBatch, production_date: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Kadaluarsa</Label><Input type="date" value={newBatch?.expiry_date ?? ""} onChange={(e) => setNewBatch({ ...newBatch, expiry_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Stok Awal</Label><Input type="number" value={newBatch?.initial_stock ?? 0} onChange={(e) => setNewBatch({ ...newBatch, initial_stock: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setNewBatch(null)}>Batal</Button><Button onClick={saveBatch}>Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

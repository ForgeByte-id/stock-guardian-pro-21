import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Gift, Save, Plus, Trash2, Info, Check, ChevronsUpDown, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/promo-rules")({
  component: PromoRulesPage,
});

/* ── Types ── */
type Product = { id: string; name: string };
type Channel = { code: string; name: string };
type FormRow = { product_id: string; quantity: number };

type PromoRule = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  conditions: { product_id: string; product_name: string; quantity: number }[];
  freebies: { product_id: string; product_name: string; quantity: number }[];
  channels: { code: string; name: string }[];
  created_at: string;
};

/* ── Status helpers ── */
type RuleStatus = "active" | "pending" | "expired" | "inactive";
function ruleStatus(r: PromoRule): RuleStatus {
  if (!r.is_active) return "inactive";
  const now = Date.now();
  const start = new Date(r.start_date).getTime();
  const end = new Date(r.end_date).getTime();
  if (now < start) return "pending";
  if (now > end) return "expired";
  return "active";
}

const STATUS_UI: Record<RuleStatus, { label: string; classes: string; showToggle: boolean }> = {
  active:   { label: "Aktif · sedang berlaku", classes: "bg-success/15 text-success-foreground border-success/30", showToggle: true },
  pending:  { label: "Belum aktif · menunggu periode", classes: "bg-warning/10 text-warning-foreground border-warning/30", showToggle: false },
  expired:  { label: "Selesai · periode berakhir", classes: "bg-muted text-muted-foreground border-border", showToggle: false },
  inactive: { label: "Nonaktif · dimatikan", classes: "bg-muted/40 text-muted-foreground/50 border-border/50", showToggle: false },
};

function desc(conds: { product_name: string; quantity: number }[], freebies: { product_name: string; quantity: number }[]): string {
  const c = conds.map((c) => `${c.quantity}x ${c.product_name}`).join(" + ");
  const f = freebies.map((f) => `${f.quantity}x ${f.product_name}`).join(" + ");
  return `Beli ${c} → dapat gratis ${f}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/* ── Page ── */
function PromoRulesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rules, setRules] = useState<PromoRule[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [conditions, setConditions] = useState<FormRow[]>([{ product_id: "", quantity: 1 }]);
  const [freebies, setFreebies] = useState<FormRow[]>([{ product_id: "", quantity: 1 }]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  // Product search popover
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [pRes, cRes, rRes] = await Promise.all([
      supabase.from("products").select("id,name").eq("is_active", true).order("name"),
      supabase.from("channels").select("code,name").eq("is_active", true).order("name"),
      supabase.from("promo_rules").select("*").order("created_at", { ascending: false }),
    ]);
    setProducts(pRes.data ?? []);
    setChannels(cRes.data ?? []);

    // Load full rule data
    const rawRules = (rRes.data ?? []) as unknown as PromoRule[];
    const fullRules = await Promise.all(rawRules.map(async (rule) => {
      const [condRes, freeRes, chanRes] = await Promise.all([
        supabase.from("promo_rule_conditions")
          .select("product_id, quantity, products!inner(name)")
          .eq("promo_rule_id", rule.id),
        supabase.from("promo_rule_freebies")
          .select("product_id, quantity, products!inner(name)")
          .eq("promo_rule_id", rule.id),
        supabase.from("promo_rule_channels")
          .select("channel_code, channels!inner(name)")
          .eq("promo_rule_id", rule.id),
      ]);
      return {
        ...rule,
        conditions: (condRes.data ?? []).map((c: any) => ({
          product_id: c.product_id,
          product_name: (c.products as any)?.name ?? "—",
          quantity: c.quantity,
        })),
        freebies: (freeRes.data ?? []).map((f: any) => ({
          product_id: f.product_id,
          product_name: (f.products as any)?.name ?? "—",
          quantity: f.quantity,
        })),
        channels: (chanRes.data ?? []).map((ch: any) => ({
          code: ch.channel_code,
          name: (ch.channels as any)?.name ?? ch.channel_code,
        })),
      } as PromoRule;
    }));
    setRules(fullRules);
  }

  const visibleRules = useMemo(
    () => rules.filter((r) => showInactive || r.is_active),
    [rules, showInactive],
  );

  // ── Form helpers ──
  function addCondition() { setConditions([...conditions, { product_id: "", quantity: 1 }]); }
  function updCondition(i: number, field: keyof FormRow, val: string | number) {
    const next = [...conditions];
    (next[i] as any)[field] = val;
    setConditions(next);
  }
  function rmCondition(i: number) { setConditions(conditions.filter((_, idx) => idx !== i)); }

  function addFreebie() { setFreebies([...freebies, { product_id: "", quantity: 1 }]); }
  function updFreebie(i: number, field: keyof FormRow, val: string | number) {
    const next = [...freebies];
    (next[i] as any)[field] = val;
    setFreebies(next);
  }
  function rmFreebie(i: number) { setFreebies(freebies.filter((_, idx) => idx !== i)); }

  function toggleChannel(code: string) {
    setSelectedChannels((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function resetForm() {
    setFormName("");
    setConditions([{ product_id: "", quantity: 1 }]);
    setFreebies([{ product_id: "", quantity: 1 }]);
    setStartDate("");
    setEndDate("");
    setSelectedChannels([]);
  }

  // ── Save ──
  async function saveRule() {
    if (!formName.trim()) { toast.error("Isi nama promo."); return; }
    const validConds = conditions.filter((c) => c.product_id && c.quantity > 0);
    const validFree = freebies.filter((f) => f.product_id && f.quantity > 0);
    if (validConds.length === 0) { toast.error("Tambahkan minimal satu produk yang wajib dibeli."); return; }
    if (validFree.length === 0) { toast.error("Tambahkan minimal satu produk gratis."); return; }
    if (!startDate || !endDate) { toast.error("Isi tanggal mulai dan selesai promo."); return; }
    if (new Date(endDate) <= new Date(startDate)) { toast.error("Tanggal selesai harus setelah tanggal mulai"); return; }
    if (selectedChannels.length === 0) { toast.error("Pilih minimal satu channel penjualan."); return; }

    setBusy(true);
    const { data: rule, error: ruleErr } = await supabase.from("promo_rules").insert({
      name: formName.trim(),
      start_date: startDate,
      end_date: endDate,
    }).select("id").single();
    if (ruleErr || !rule) { setBusy(false); toast.error(ruleErr?.message ?? "Aturan promo gagal disimpan."); return; }

    const inserts = [
      supabase.from("promo_rule_conditions").insert(
        validConds.map((c) => ({ promo_rule_id: rule.id, product_id: c.product_id, quantity: c.quantity })),
      ),
      supabase.from("promo_rule_freebies").insert(
        validFree.map((f) => ({ promo_rule_id: rule.id, product_id: f.product_id, quantity: f.quantity })),
      ),
      supabase.from("promo_rule_channels").insert(
        selectedChannels.map((code) => ({ promo_rule_id: rule.id, channel_code: code })),
      ),
    ];

    const results = await Promise.all(inserts);
    const err = results.find((r) => r.error);
    if (err) { toast.error(err.error?.message ?? "Detail aturan promo gagal disimpan."); setBusy(false); return; }

    setBusy(false);
    toast.success("Aturan promo berhasil disimpan.");
    resetForm();
    void load();
  }

  // ── Toggle active ──
  async function toggleActive(rule: PromoRule) {
    const { error } = await supabase.from("promo_rules")
      .update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) { toast.error(error.message); return; }
    void load();
  }

  // ── Product select component ──
  const ProductSelect = ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => {
    const selected = products.find((p) => p.id === value);
    return (
      <Popover open={openPopover === id} onOpenChange={(v) => setOpenPopover(v ? id : null)}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between text-sm font-normal h-9"
            aria-expanded={openPopover === id}>
            {selected ? selected.name : "Pilih produk…"}
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cari nama produk…" />
            <CommandList>
              <CommandEmpty>Produk tidak ditemukan. Coba kata kunci lain.</CommandEmpty>
              <CommandGroup>
                {products.map((p) => (
                  <CommandItem key={p.id} value={p.name} onSelect={() => { onChange(p.id); setOpenPopover(null); }}>
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === p.id ? "opacity-100" : "opacity-0")} />
                    {p.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aturan promo</h1>
          <p className="text-sm text-muted-foreground">
            Data simulasi &middot; {new Date().toLocaleDateString("id-ID")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] italic text-muted-foreground hidden sm:inline">
            setiap perubahan stok punya jejak
          </span>
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
            {showInactive ? "Sembunyikan aturan nonaktif" : "Tampilkan semua aturan"}
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <Alert className="bg-info/10 border-info/30 text-info-foreground">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
           Promo marketplace mencatat produk yang dibeli, sedangkan produk gratis tidak ikut tercatat pada pesanan.
           Catat aturan di sini agar jumlah produk gratis yang keluar gudang ikut dihitung dalam stok.
        </AlertDescription>
      </Alert>

      {/* ═══ Card: Buat Aturan Promo ═══ */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3 border-b border-border/40">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-success/10">
            <Gift className="h-4 w-4 text-success-foreground" />
          </div>
          <CardTitle className="text-base">Buat aturan promo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          {/* Nama Promo */}
          <Field label="Nama promo">
            <Input value={formName} onChange={(e) => setFormName(e.target.value)}
              placeholder="Contoh: Beli 1 sabun, gratis 3" maxLength={200} />
          </Field>

          {/* Syarat Beli */}
          <div>
            <Label className="text-sm font-medium">Syarat beli</Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Pembeli wajib membeli semua produk berikut (logika AND)
            </p>
            <div className="space-y-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <ProductSelect value={c.product_id}
                      onChange={(v) => updCondition(i, "product_id", v)} id={`cond-${i}`} />
                  </div>
                  <Input type="number" min={1} value={c.quantity}
                    onChange={(e) => updCondition(i, "quantity", Number(e.target.value))}
                    className="w-20 h-9 text-center" />
                  {conditions.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => rmCondition(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={addCondition}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah produk wajib dibeli
            </Button>
          </div>

          {/* Barang Gratis */}
          <div>
            <Label className="text-sm font-medium">Barang gratis</Label>
            <p className="text-[11px] text-muted-foreground mb-2">
              Produk gratis boleh berbeda dari produk syarat dan bisa lebih dari satu jenis
            </p>
            <div className="space-y-2">
              {freebies.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1">
                    <ProductSelect value={f.product_id}
                      onChange={(v) => updFreebie(i, "product_id", v)} id={`free-${i}`} />
                  </div>
                  <Input type="number" min={1} value={f.quantity}
                    onChange={(e) => updFreebie(i, "quantity", Number(e.target.value))}
                    className="w-20 h-9 text-center" />
                  {freebies.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => rmFreebie(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={addFreebie}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah produk gratis
            </Button>
          </div>

          {/* Periode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Mulai berlaku">
              <Input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </Field>
            <Field label="Berakhir pada">
              <Input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
            </Field>
          </div>

          {/* Channel */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Channel penjualan</Label>
            <div className="flex flex-wrap gap-3">
              {channels.map((ch) => (
                <label key={ch.code} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox checked={selectedChannels.includes(ch.code)}
                    onCheckedChange={() => toggleChannel(ch.code)} />
                  {ch.name}
                </label>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="rounded-lg bg-muted/30 border border-border/40 px-4 py-3 text-[11px] text-muted-foreground space-y-1">
            <p>• Jumlah produk gratis mengikuti aturan promo.</p>
            <p>• Promo bertingkat dibuat sebagai aturan terpisah.</p>
            <p>• Setiap aturan punya periode berlaku sendiri.</p>
            <p>• Riwayat pesanan lama tidak berubah saat aturan promo baru dibuat.</p>
          </div>

          {/* Simpan Button */}
          <div className="flex justify-end">
            <Button onClick={saveRule} disabled={busy} className="bg-success hover:bg-success/90">
              <Save className="mr-1.5 h-4 w-4" />{busy ? "Menyimpan aturan…" : "Simpan aturan promo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Card: Daftar Aturan Promo ═══ */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/30">
          <CardTitle className="text-base">Daftar aturan promo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visibleRules.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Gift className="mx-auto h-6 w-6 mb-2 opacity-30" />
              <p className="font-medium text-sm">Belum ada aturan promo</p>
              <p className="text-xs mt-1">Buat aturan promo pertama menggunakan form di atas.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {visibleRules.map((rule) => {
                const st = ruleStatus(rule);
                const ui = STATUS_UI[st];
                return (
                  <div key={rule.id} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-muted/15 transition-colors">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{rule.name}</span>
                        <div className="flex gap-1 flex-wrap">
                          {rule.channels.map((ch) => (
                            <Badge key={ch.code} variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                              {ch.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {desc(rule.conditions, rule.freebies)}
                      </p>
                      <p className="text-[11px] text-muted-foreground/60 font-mono tabular-nums">
                        Berlaku: {fmtDate(rule.start_date)} — {fmtDate(rule.end_date)}
                      </p>
                    </div>
                    {/* Right: status + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {ui.showToggle ? (
                        <div className="flex items-center gap-1.5" title={rule.is_active ? "Matikan aturan promo" : "Aktifkan aturan promo"}>
                          <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} className="scale-90" />
                          <span className="text-xs font-medium text-success-foreground">{ui.label}</span>
                        </div>
                      ) : (
                        <Badge variant="outline" className={`text-[11px] px-2 py-0 ${ui.classes}`}>{ui.label}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

/* ── Mini Field ── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

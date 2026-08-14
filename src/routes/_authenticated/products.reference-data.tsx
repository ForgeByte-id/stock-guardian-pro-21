import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Power, RotateCcw, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products/reference-data")({
  component: RefDataPage,
});

type Channel = { code: string; name: string; is_active: boolean };
type Reason = { code: string; name: string; direction: string; is_system: boolean; is_active: boolean };

function RefDataPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [showInactive, setShowInactive] = useState(false);

  // Modal state: channel
  const [channelModal, setChannelModal] = useState(false);
  const [channelCode, setChannelCode] = useState("");
  const [channelName, setChannelName] = useState("");

  // Modal state: reason
  const [reasonModal, setReasonModal] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonName, setReasonName] = useState("");
  const [reasonDir, setReasonDir] = useState<"in" | "out">("out");

  // Confirm toggle active
  const [confirmTarget, setConfirmTarget] = useState<{ kind: "channel" | "reason"; code: string; name: string; active: boolean } | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [c, r] = await Promise.all([
      supabase.from("channels").select("code,name,is_active").order("name"),
      supabase.from("movement_reasons").select("code,name,direction,is_system,is_active").order("direction").order("name"),
    ]);
    setChannels(c.data ?? []);
    setReasons(r.data ?? []);
  }

  /* ── Filter ── */
  const visibleChannels = channels.filter((c) => showInactive || c.is_active);
  const visibleReasons = reasons.filter((r) => showInactive || r.is_active);

  /* ── Channel actions ── */
  async function addChannel() {
    if (!channelCode.trim() || !channelName.trim()) { toast.error("Kode dan nama channel wajib diisi"); return; }
    const { error } = await supabase.from("channels").insert({
      code: channelCode.trim(),
      name: channelName.trim(),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Channel berhasil ditambahkan.");
    setChannelModal(false);
    setChannelCode(""); setChannelName("");
    void load();
  }

  async function toggleChannelActive() {
    if (!confirmTarget || confirmTarget.kind !== "channel") return;
    const next = !confirmTarget.active;
    const { error } = await supabase.from("channels")
      .update({ is_active: next }).eq("code", confirmTarget.code);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Channel diaktifkan" : "Channel dinonaktifkan");
    setConfirmTarget(null);
    void load();
  }

  /* ── Reason actions ── */
  async function addReason() {
    if (!reasonCode.trim() || !reasonName.trim()) { toast.error("Kode dan nama alasan wajib diisi"); return; }
    const { error } = await supabase.from("movement_reasons").insert({
      code: reasonCode.trim(),
      name: reasonName.trim(),
      direction: reasonDir,
      is_system: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Alasan berhasil ditambahkan.");
    setReasonModal(false);
    setReasonCode(""); setReasonName("");
    void load();
  }

  async function toggleReasonActive() {
    if (!confirmTarget || confirmTarget.kind !== "reason") return;
    const next = !confirmTarget.active;
    const { error } = await supabase.from("movement_reasons")
      .update({ is_active: next }).eq("code", confirmTarget.code);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? "Alasan diaktifkan" : "Alasan dinonaktifkan");
    setConfirmTarget(null);
    void load();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Channel dan alasan pergerakan</h1>
          <p className="text-sm text-muted-foreground">Channel dan alasan adalah data referensi untuk mencatat pergerakan stok. Alasan bawaan sistem tidak dapat dinonaktifkan.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}
          {showInactive ? "Sembunyikan yang nonaktif" : "Tampilkan channel dan alasan nonaktif"}
        </Button>
      </div>

      {/* Card: Channels */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Channel (asal transaksi)</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setChannelModal(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah channel
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode channel</TableHead>
                <TableHead>Nama channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleChannels.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Belum ada channel. Tambahkan channel agar transaksi bisa diberi sumber.</TableCell></TableRow>
              ) : (
                visibleChannels.map((c) => (
                  <TableRow key={c.code} className={!c.is_active ? "opacity-40" : ""}>
                    <TableCell className="font-mono text-xs py-3">{c.code}</TableCell>
                    <TableCell className="py-3">{c.name}</TableCell>
                    <TableCell className="py-3">
                      {c.is_active
                        ? <Badge className="bg-success/10 text-success-foreground border-success/30 hover:bg-success/15 text-[11px]">Aktif</Badge>
                        : <Badge variant="outline" className="text-[11px]">Nonaktif</Badge>
                      }
                    </TableCell>
                    <TableCell className="py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title={c.is_active ? "Nonaktifkan channel" : "Aktifkan channel"}
                        onClick={() => setConfirmTarget({ kind: "channel", code: c.code, name: c.name, active: c.is_active })}>
                        {c.is_active
                          ? <Power className="h-3.5 w-3.5" />
                          : <RotateCcw className="h-3.5 w-3.5" />
                        }
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Card: Reasons */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Alasan pergerakan stok</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setReasonModal(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah alasan
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode alasan</TableHead>
                <TableHead>Nama alasan</TableHead>
                <TableHead>Arah stok</TableHead>
                <TableHead>Tipe alasan</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleReasons.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Belum ada alasan pergerakan. Tambahkan alasan untuk menjelaskan setiap perubahan stok.</TableCell></TableRow>
              ) : (
                visibleReasons.map((r) => (
                  <TableRow key={r.code} className={!r.is_active ? "opacity-40" : ""}>
                    <TableCell className="font-mono text-xs py-3">{r.code}</TableCell>
                    <TableCell className="py-3">{r.name}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant="outline" className="text-[11px]">{r.direction.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      {r.is_system
                        ? <Badge className="bg-info/10 text-info-foreground border-info/30 text-[11px]">Bawaan sistem</Badge>
                        : <Badge variant="outline" className="text-[11px]">Buatan sendiri</Badge>
                      }
                    </TableCell>
                    <TableCell className="py-3">
                      {!r.is_system && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title={r.is_active ? "Nonaktifkan alasan" : "Aktifkan alasan"}
                          onClick={() => setConfirmTarget({ kind: "reason", code: r.code, name: r.name, active: r.is_active })}>
                          {r.is_active
                            ? <Power className="h-3.5 w-3.5" />
                            : <RotateCcw className="h-3.5 w-3.5" />
                          }
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Modal: Add Channel ── */}
      <Dialog open={channelModal} onOpenChange={setChannelModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah channel</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Kode channel">
              <Input value={channelCode} onChange={(e) => setChannelCode(e.target.value)}
                placeholder="contoh: SHOPEE" className="uppercase" maxLength={20} />
            </Field>
            <Field label="Nama channel">
              <Input value={channelName} onChange={(e) => setChannelName(e.target.value)}
                placeholder="contoh: Shopee" maxLength={100} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChannelModal(false)}>Batal</Button>
            <Button onClick={addChannel}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Add Reason ── */}
      <Dialog open={reasonModal} onOpenChange={setReasonModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah alasan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Kode alasan">
              <Input value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}
                placeholder="contoh: hadiah" maxLength={30} />
            </Field>
            <Field label="Nama alasan">
              <Input value={reasonName} onChange={(e) => setReasonName(e.target.value)}
                placeholder="contoh: Hadiah" maxLength={100} />
            </Field>
            <Field label="Arah stok">
              <Select value={reasonDir} onValueChange={(v: "in" | "out") => setReasonDir(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Masuk (IN)</SelectItem>
                  <SelectItem value="out">Keluar (OUT)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonModal(false)}>Batal</Button>
            <Button onClick={addReason}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Toggle Active Confirmation ── */}
      <Dialog open={confirmTarget !== null} onOpenChange={(v) => { if (!v) setConfirmTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget?.active ? "Nonaktifkan" : "Aktifkan"} {confirmTarget?.kind === "channel" ? "channel" : "alasan"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Anda yakin ingin {confirmTarget?.active ? "menonaktifkan" : "mengaktifkan"} <strong>{confirmTarget?.name}</strong>?
            Data yang sudah tercatat tetap tersimpan dan tidak berubah.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>Batal</Button>
            <Button variant={confirmTarget?.active ? "destructive" : "default"}
              onClick={confirmTarget?.kind === "channel" ? toggleChannelActive : toggleReasonActive}>
              {confirmTarget?.active ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

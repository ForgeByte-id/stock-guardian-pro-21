import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reconciliation/opname")({
  component: OpnamePage,
});

type Session = { id: string; session_name: string; status: string; started_at: string; completed_at: string | null };
type Entry = {
  id: string; batch_id: string; system_stock: number; physical_count: number;
  discrepancy: number; correction_applied: boolean;
  batch: { batch_number: string; products: { name: string } | null } | null;
};

function OpnamePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [active, setActive] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadSessions(); }, []);
  async function loadSessions() {
    const { data } = await supabase.from("opname_sessions")
      .select("id,session_name,status,started_at,completed_at").order("started_at", { ascending: false }).limit(20);
    setSessions(data ?? []);
    const a = data?.find((s) => s.status === "ACTIVE") ?? null;
    setActive(a);
    if (a) void loadEntries(a.id);
  }

  async function loadEntries(sid: string) {
    const { data } = await supabase.from("opname_entries")
      .select(`id,batch_id,system_stock,physical_count,discrepancy,correction_applied,
        batch:batch_id(batch_number, products:product_id(name))`)
      .eq("session_id", sid);
    setEntries((data ?? []) as unknown as Entry[]);
  }

  async function startSession() {
    if (!newName.trim()) return toast.error("Isi nama sesi.");
    setBusy(true);
    const { data: user } = await supabase.auth.getUser();
    const { data: session, error } = await supabase.from("opname_sessions").insert({
      session_name: newName, created_by: user.user!.id,
    }).select().single();
    if (error) { setBusy(false); return toast.error(error.message); }

    // Seed all active batches
    const { data: batches } = await supabase.from("batches")
      .select("id,current_stock").eq("is_active", true);
    const rows = (batches ?? []).map((b) => ({
      session_id: session.id, batch_id: b.id,
      system_stock: b.current_stock, physical_count: b.current_stock, counted_by: user.user!.id,
    }));
    if (rows.length) await supabase.from("opname_entries").insert(rows);
    setBusy(false); setNewName("");
    await loadSessions();
    toast.success("Sesi opname dimulai. Isi hitungan fisik lalu terapkan koreksi.");
  }

  async function updatePhysical(id: string, physical: number) {
    await supabase.from("opname_entries").update({ physical_count: physical }).eq("id", id);
    if (active) await loadEntries(active.id);
  }

  async function applyOne(id: string) {
    const { error } = await supabase.rpc("apply_opname_correction", { p_entry_id: id } as never);
    if (error) return toast.error(error.message);
    toast.success("Koreksi diterapkan.");
    if (active) await loadEntries(active.id);
  }

  async function closeSession() {
    if (!active) return;
    await supabase.from("opname_sessions").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", active.id);
    toast.success("Sesi opname ditutup.");
    await loadSessions();
  }

  const withDiff = entries.filter((e) => e.discrepancy !== 0);
  const pending = withDiff.filter((e) => !e.correction_applied).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stok Opname</h1>
        <p className="text-sm text-muted-foreground">
          Bandingkan stok fisik dengan catatan sistem, lalu terapkan koreksi (menghasilkan entri ledger).
        </p>
      </div>

      {!active && (
        <Card>
          <CardHeader><CardTitle className="text-base">Mulai Sesi Baru</CardTitle></CardHeader>
          <CardContent className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="mis. Opname Mingguan 13 Juli" />
            <Button onClick={startSession} disabled={busy}><Play className="mr-2 h-4 w-4" />Mulai Opname</Button>
          </CardContent>
        </Card>
      )}

      {active && (
        <Card>
          <CardHeader className="flex-row justify-between items-center space-y-0">
            <div>
              <CardTitle className="text-base">Sesi Aktif: {active.session_name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {entries.length} batch · {withDiff.length} punya selisih · {pending} koreksi belum diterapkan
              </p>
            </div>
            <Button variant="outline" onClick={closeSession} disabled={pending > 0}>
              <CheckCircle2 className="mr-2 h-4 w-4" />Tutup Sesi
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk / Batch</TableHead>
                  <TableHead className="text-right">Sistem</TableHead>
                  <TableHead className="text-right w-40">Fisik</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{e.batch?.products?.name ?? "-"}</div>
                      <div className="text-[11px] text-muted-foreground">{e.batch?.batch_number}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.system_stock}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" defaultValue={e.physical_count}
                        onBlur={(ev) => updatePhysical(e.id, Number(ev.target.value))} className="text-right" />
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${
                      e.discrepancy < 0 ? "text-destructive" : e.discrepancy > 0 ? "text-warning-foreground" : ""
                    }`}>{e.discrepancy > 0 ? `+${e.discrepancy}` : e.discrepancy}</TableCell>
                    <TableCell className="text-right">
                      {e.correction_applied ? (
                        <Badge variant="outline" className="bg-success/15 text-success-foreground border-success/40">Diterapkan</Badge>
                      ) : e.discrepancy !== 0 ? (
                        <Button size="sm" variant="outline" onClick={() => applyOne(e.id)}>Terapkan</Button>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat Sesi</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Sesi</TableHead>
                <TableHead>Mulai</TableHead>
                <TableHead>Selesai</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.session_name}</TableCell>
                  <TableCell className="text-xs">{new Date(s.started_at).toLocaleString("id-ID")}</TableCell>
                  <TableCell className="text-xs">{s.completed_at ? new Date(s.completed_at).toLocaleString("id-ID") : "-"}</TableCell>
                  <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

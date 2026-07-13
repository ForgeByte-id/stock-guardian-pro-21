import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/products/reference-data")({
  component: RefDataPage,
});

function RefDataPage() {
  const [channels, setChannels] = useState<{ code: string; name: string; is_active: boolean }[]>([]);
  const [reasons, setReasons] = useState<{ code: string; name: string; direction: string; is_system: boolean; is_active: boolean }[]>([]);
  useEffect(() => {
    void (async () => {
      const [c, r] = await Promise.all([
        supabase.from("channels").select("code,name,is_active").order("name"),
        supabase.from("movement_reasons").select("code,name,direction,is_system,is_active").order("direction").order("name"),
      ]);
      setChannels(c.data ?? []); setReasons(r.data ?? []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Channel & Alasan</h1>
        <p className="text-sm text-muted-foreground">Data referensi sistem. Alasan sistem tidak dapat dihapus.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Channel</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {channels.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.is_active ? <Badge>Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Alasan Pergerakan</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Nama</TableHead><TableHead>Arah</TableHead><TableHead>Tipe</TableHead></TableRow></TableHeader>
            <TableBody>
              {reasons.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{r.direction.toUpperCase()}</Badge></TableCell>
                  <TableCell>{r.is_system ? <Badge>Sistem</Badge> : <Badge variant="outline">Custom</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

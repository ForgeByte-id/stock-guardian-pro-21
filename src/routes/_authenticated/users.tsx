import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

type UserRow = { id: string; email: string | null; display_name: string | null };

function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);

  useEffect(() => { void load(); }, []);
  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id,email,display_name").order("email");
    setRows(profiles ?? []);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pengguna Admin</h1>
        <p className="text-sm text-muted-foreground">Semua pengguna memakai satu role Admin dengan akses penuh untuk mengelola data dan stok.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Pengguna terdaftar</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Pengguna</TableHead><TableHead>Role akses</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{(u.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <div className="text-sm font-medium">{u.display_name ?? u.email}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge>Admin</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

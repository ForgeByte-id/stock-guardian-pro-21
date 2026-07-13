import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCurrentRole } from "@/hooks/use-role";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

type UserRow = { id: string; email: string | null; display_name: string | null; role: string | null };

function UsersPage() {
  const { isAdmin, loading } = useCurrentRole();
  const [rows, setRows] = useState<UserRow[]>([]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin]);
  async function load() {
    const { data: profiles } = await supabase.from("profiles").select("id,email,display_name").order("email");
    const { data: roles } = await supabase.from("user_roles").select("user_id,role,is_active").eq("is_active", true);
    const map = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    setRows((profiles ?? []).map((p) => ({ ...p, role: map.get(p.id) ?? null })));
  }

  async function changeRole(userId: string, role: "admin" | "manager" | "operator") {
    await supabase.from("user_roles").update({ is_active: false }).eq("user_id", userId);
    const { error } = await supabase.from("user_roles").upsert({ user_id: userId, role, is_active: true });
    if (error) return toast.error(error.message);
    toast.success("Role diperbarui."); load();
  }

  if (loading) return <div className="text-sm text-muted-foreground">Memuat…</div>;
  if (!isAdmin) return <div className="text-sm text-muted-foreground">Hanya admin yang dapat mengelola pengguna.</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kelola Pengguna</h1>
        <p className="text-sm text-muted-foreground">Atur role pengguna. Admin memiliki akses penuh; manager mengelola operasional; operator input pergerakan &amp; opname.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Pengguna Terdaftar</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Pengguna</TableHead><TableHead>Role Saat Ini</TableHead><TableHead className="text-right">Ubah</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{(u.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div>
                        <div className="text-sm font-medium">{u.display_name ?? u.email}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{u.role ?? "—"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {(["admin", "manager", "operator"] as const).map((r) => (
                      <Button key={r} size="sm" variant={u.role === r ? "default" : "outline"} onClick={() => changeRole(u.id, r)}>
                        {r}
                      </Button>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

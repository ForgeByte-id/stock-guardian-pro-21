import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      setDisplayName(p?.display_name ?? "");
    })();
  }, []);

  async function save() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success("Profil berhasil disimpan.");
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
        <p className="text-sm text-muted-foreground">Kelola nama yang tampil di aplikasi. Email dan role Admin tidak dapat diubah di sini.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Informasi akun</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>Email akun</Label><Input value={email} disabled /></div>
          <div className="space-y-1.5"><Label>Nama tampilan</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Role akses</Label><Input value="Admin" disabled className="capitalize" /></div>
          <div className="flex justify-end"><Button onClick={save}>Simpan perubahan</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

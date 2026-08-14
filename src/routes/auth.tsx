import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
       setError("Isi email dan kata sandi untuk masuk.");
      return;
    }
    setError("");
    setLoading(true);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authErr) {
      const msg =
        authErr.message === "Invalid login credentials"
           ? "Email atau kata sandi belum sesuai. Periksa kembali lalu coba lagi."
          : authErr.message;
      setError(msg);
      toast.error(msg);
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4">
      {/* Background decorative elements */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/12 blur-3xl" />
        <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] opacity-[0.04] text-primary/30" viewBox="0 0 200 200" fill="none" aria-hidden>
          <pattern id="login-grid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" stroke="currentColor" strokeWidth="0.5" fill="none" />
          </pattern>
          <rect width="200" height="200" fill="url(#login-grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-10 flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <div className="absolute -inset-2 rounded-2xl bg-accent/15 blur-lg" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/10">
              <ShieldCheck className="h-7 w-7" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Stok Akurat</h1>
            <div className="mt-3 flex items-center gap-3 justify-center">
              <div className="h-px w-6 bg-gradient-to-r from-transparent to-primary/30" />
              <p className="text-sm leading-relaxed text-muted-foreground max-w-[240px]">
                Tidak ada angka stok yang berubah tanpa jejak.
              </p>
              <div className="h-px w-6 bg-gradient-to-l from-transparent to-primary/30" />
            </div>
          </div>
        </div>

        {/* Login card */}
        <Card className="border-border/50 shadow-lg shadow-primary/5 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-primary/40 to-accent/40" />
          <CardContent className="p-6 pt-5">
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  placeholder="admin@stokakurat.id"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  autoComplete="email"
                  disabled={loading}
                  className="h-10"
                />
              </div>

              <div className="space-y-1.5">
                 <Label htmlFor="password" className="text-sm font-medium">Kata sandi</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                     placeholder="Ketik kata sandi"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    disabled={loading}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPw ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading} className="w-full h-10 font-medium">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                     Memeriksa akses…
                  </span>
                ) : (
                  "Masuk"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

         <p className="mt-6 text-center text-[11px] text-muted-foreground/60">Stok Akurat v2 — Rekonsiliasi stok</p>
      </div>
    </div>
  );
}

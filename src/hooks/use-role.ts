import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "./types";

export type { AppRole } from "./types";

export function useCurrentRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("current_user_role");
      setRole((data as AppRole | null) ?? null);
      setLoading(false);
    })();
  }, []);
  return { role, loading, isAdmin: role === "admin", isManager: role === "manager" || role === "admin" };
}

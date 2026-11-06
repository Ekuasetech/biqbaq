"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "./client";

/** The signed-in user, null when signed out, or undefined while still checking. */
export function useSessionUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      setTimeout(() => setUser(null), 0);
      return;
    }
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Keeps the same identity on token refreshes, so pages do not reload their data.
      setUser((current) => (current?.id === session?.user?.id && current ? current : session?.user ?? null));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return user;
}

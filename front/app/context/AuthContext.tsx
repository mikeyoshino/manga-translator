import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase";
import { apiFetch } from "@/utils/api";

interface SubscriptionInfo {
  tier_id: string;
  tier_name: string;
  monthly_tokens: number;
  billing_cycle: string | null;
  period_end: string | null;
  permissions: Record<string, any>;
}

interface AuthContextValue {
  user: User | null;
  tokenBalance: number;
  isAdmin: boolean;
  tierId: string;
  subscription: SubscriptionInfo | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string, locale?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tierId, setTierId] = useState("free");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap user state from cookie on mount.
  // Uses plain fetch (not apiFetch) to avoid firing auth:expired during
  // the initial bootstrap — the backend may refresh the token silently.
  const bootstrapUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser({ id: data.id, email: data.email } as User);
        setTokenBalance(data.token_balance ?? 0);
        setIsAdmin(data.is_admin ?? false);
        setTierId(data.tier_id ?? "free");
        setSubscription(data.subscription ?? null);
      } else {
        setUser(null);
        setTokenBalance(0);
        setIsAdmin(false);
        setTierId("free");
        setSubscription(null);
      }
    } catch {
      setUser(null);
      setTokenBalance(0);
      setIsAdmin(false);
      setTierId("free");
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapUser();
  }, [bootstrapUser]);

  // Listen for auth:expired custom event to trigger sign-out
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setTokenBalance(0);
      setIsAdmin(false);
      setTierId("free");
      setSubscription(null);
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const res = await apiFetch("/api/user/profile");
      if (res.ok) {
        const profile = await res.json();
        setTokenBalance(profile.token_balance ?? 0);
        setIsAdmin(profile.is_admin ?? false);
      }
    } catch {
      // silent — balance will show stale
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error as Error };

    // Send tokens to backend to set httpOnly cookies
    const session = data.session;
    if (session) {
      try {
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        });
        if (res.ok) {
          const userData = await res.json();
          setUser({ id: userData.id, email: userData.email } as User);
          setIsAdmin(userData.is_admin ?? false);
          // Fetch balance
          await refreshBalance();
        }
      } catch {
        // Cookie session creation failed, but Supabase auth succeeded
      }
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, displayName?: string, locale?: string) => {
    const redirectLocale = locale || "th";
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/${redirectLocale}/login`,
      },
    });
    if (error) return { error: error as Error };

    // If auto-confirmed, set session cookies
    const session = data.session;
    if (session) {
      try {
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        });
        if (res.ok) {
          const userData = await res.json();
          setUser({ id: userData.id, email: userData.email } as User);
          setIsAdmin(userData.is_admin ?? false);
          await refreshBalance();
        }
      } catch {
        // silent
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await apiFetch("/api/auth/signout", { method: "POST" });
    await supabase.auth.signOut();
    setUser(null);
    setTokenBalance(0);
    setIsAdmin(false);
    setTierId("free");
    setSubscription(null);
  };

  return (
    <AuthContext.Provider value={{ user, tokenBalance, isAdmin, tierId, subscription, loading, signIn, signUp, signOut, refreshBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Check if the current user has a specific feature enabled by their subscription tier.
 * Admins always return true. Returns false while loading or if not authenticated.
 */
export function useHasFeature(feature: string): boolean {
  const { isAdmin, subscription } = useAuth();
  if (isAdmin) return true;
  if (!subscription?.permissions) return false;
  return !!subscription.permissions[feature];
}

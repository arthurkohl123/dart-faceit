'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

// ─── Typen ────────────────────────────────────────────────────────────────────

type ProfileData = {
  id: string;
  username: string | null;
  elo: number;
  gamesPlayed: number;
  wins: number;
  phone_verified: boolean;
  phone_verified_at: string | null;
  phone_number: string | null;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  isPremium: boolean;
};

type AuthContextValue = {
  session: Session | null | undefined;
  user: User | null;
  profile: ProfileData | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  session: undefined,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('supabaseId', userId)
        .single();

      if (data?.is_banned) {
        await supabase.auth.signOut();
        routerRef.current.push('/auth/banned');
        return;
      }

      setProfile(data ? {
        id: data.id,
        username: data.username ?? null,
        elo: data.elo ?? 1000,
        gamesPlayed: data.gamesPlayed ?? 0,
        wins: data.wins ?? 0,
        phone_verified: Boolean(data.phone_verified),
        phone_verified_at: data.phone_verified_at ?? null,
        phone_number: data.phone_number ?? null,
        is_admin: Boolean(data.is_admin),
        is_banned: false,
        ban_reason: data.ban_reason ?? null,
        isPremium: Boolean(data.isPremium),
      } : null);
    } catch {
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (current?.user?.id) await fetchProfile(current.user.id);
  }, [fetchProfile, supabase]);

  // Einziger Auth-Mechanismus: onAuthStateChange feuert beim Mount sofort
  // mit dem initialen State (INITIAL_SESSION Event) – kein separates getSession nötig.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }

        // Loading nach dem ersten Event immer beenden
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
    }),
    [session, profile, loading, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
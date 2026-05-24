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
  /** Aktuelle Supabase-Session – null wenn nicht eingeloggt, undefined während des Ladens */
  session: Session | null | undefined;
  /** Eingeloggter Supabase-User */
  user: User | null;
  /** Profil-Daten aus der `profiles`-Tabelle */
  profile: ProfileData | null;
  /** True solange die initiale Session-Prüfung läuft */
  loading: boolean;
  /** Profil manuell neu laden (z. B. nach Elo-Änderung) */
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // router in einem Ref speichern damit fetchProfile stabil bleibt
  // und den useEffect nicht bei jedem Render neu triggert.
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profil aus der Datenbank laden – router kommt aus dem Ref, kein Re-Render-Trigger
  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('supabaseId', userId)
        .single();

      if (data) {
        // Gebannte Nutzer sofort ausloggen und zur Ban-Seite weiterleiten
        if (data.is_banned) {
          await supabase.auth.signOut();
          routerRef.current.push('/auth/banned');
          return;
        }

        setProfile({
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
        });
      } else {
        setProfile(null);
      }
    },
    [supabase] // router ist bewusst nicht hier – wird über routerRef gelesen
  );

  // Öffentliche Methode zum manuellen Neu-Laden des Profils
  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  }, [fetchProfile, session?.user?.id]);

  // Initiale Session laden + Auth-State-Listener registrieren
  useEffect(() => {
    let mounted = true;

    // Initiale Session aus dem Cookie lesen
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (!mounted) return;
      setSession(initialSession);
      if (initialSession?.user) {
        await fetchProfile(initialSession.user.id);
      }
      // Loading immer beenden – egal ob Session vorhanden oder nicht
      if (mounted) setLoading(false);
    });

    // Auf Auth-Änderungen reagieren (Login, Logout, Token-Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        setSession(newSession);

        if (newSession?.user) {
          await fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
        }

        // Nach einem Token-Refresh kein erneutes Loading-Flackern
        if (event !== 'TOKEN_REFRESHED' && mounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, supabase]); // fetchProfile ist jetzt stabil (kein router als Dep)

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
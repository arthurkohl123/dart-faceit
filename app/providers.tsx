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
import { FriendRequestPopup } from '@/components/friend-request-popup';
import { FriendsChatLauncher } from '@/components/friends-chat-launcher';

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

  const fetchProfile = useCallback(async (userId: string, authUser?: User | null) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('supabaseId', userId)
        .maybeSingle();

      let profileRow = data;

      if (!profileRow && authUser?.user_metadata?.username) {
        const { data: createdProfile } = await supabase
          .from('profiles')
          .upsert({
            supabaseId: userId,
            username: authUser.user_metadata.username,
            elo: 1000,
            gamesPlayed: 0,
            wins: 0,
            phone_number: authUser.user_metadata.phone_number ?? null,
            phone_verified: Boolean(authUser.user_metadata.phone_verified),
            phone_verified_at: authUser.user_metadata.phone_verified ? new Date().toISOString() : null,
          }, { onConflict: 'supabaseId' })
          .select('*')
          .maybeSingle();

        profileRow = createdProfile ?? null;
      }

      if (profileRow?.is_banned) {
        await supabase.auth.signOut();
        routerRef.current.push('/auth/banned');
        return;
      }

      setProfile(profileRow ? {
        id: profileRow.id,
        username: profileRow.username ?? null,
        elo: profileRow.elo ?? 1000,
        gamesPlayed: profileRow.gamesPlayed ?? 0,
        wins: profileRow.wins ?? 0,
        phone_verified: Boolean(profileRow.phone_verified),
        phone_verified_at: profileRow.phone_verified_at ?? null,
        phone_number: profileRow.phone_number ?? null,
        is_admin: Boolean(profileRow.is_admin),
        is_banned: false,
        ban_reason: profileRow.ban_reason ?? null,
        isPremium: Boolean(profileRow.isPremium),
      } : null);
    } catch {
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (current?.user?.id) await fetchProfile(current.user.id, current.user);
  }, [fetchProfile, supabase]);

  useEffect(() => {
    let mounted = true;

    // 1. getSession() sofort aufrufen – liefert die Session synchron aus dem Cookie.
    //    Damit wird loading garantiert beendet, auch wenn onAuthStateChange verzögert feuert.
    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      if (!mounted) return;
      setSession(initial);
      if (initial?.user) {
        await fetchProfile(initial.user.id, initial.user);
      }
      if (mounted) setLoading(false);
    });

    // 2. onAuthStateChange für spätere Updates (Login, Logout, Token-Refresh).
    //    INITIAL_SESSION wird hier ignoriert – getSession() hat das bereits erledigt.
    //
    //    WICHTIG – Deadlock-Prävention:
    //    Der Callback darf KEINE Supabase-Operationen direkt awaiten!
    //    Supabase Auth-JS hält beim Feuern von TOKEN_REFRESHED / SIGNED_IN einen
    //    exklusiven Navigator Lock (Web Locks API). Wenn der Callback dann
    //    fetchProfile() aufruft, versucht supabase.from() intern getSession()
    //    → _acquireLock() → der Lock ist bereits gehalten → DEADLOCK
    //    → infinite loading auf allen Seiten.
    //    Fix: Supabase-DB-Operationen via setTimeout(fn, 0) aus dem Lock-Kontext
    //    herausverschieben, sodass der Callback zuerst beendet wird und der
    //    Navigator Lock freigegeben wird, bevor fetchProfile() läuft.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted) return;
        if (event === 'INITIAL_SESSION') return; // bereits via getSession() behandelt

        // Session-State synchron setzen – kein Supabase-Aufruf, kein Lock-Problem
        setSession(newSession);

        if (!newSession?.user) {
          setProfile(null);
          if (mounted) setLoading(false);
          return;
        }

        const userId = newSession.user.id;

        // fetchProfile() MUSS außerhalb des Lock-Kontexts laufen.
        // setTimeout(fn, 0) stellt sicher, dass der onAuthStateChange-Callback
        // vollständig beendet ist (und der Navigator Lock freigegeben wurde),
        // bevor fetchProfile() ausgeführt wird.
        setTimeout(async () => {
          if (!mounted) return;
          await fetchProfile(userId, newSession.user);
          if (mounted) setLoading(false);
        }, 0);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  // A small, short-lived presence signal powers the friends page. It is kept
  // outside the Auth callback so it can never contend with Supabase's auth
  // navigator lock during token refreshes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const heartbeat = () => {
      void supabase.rpc('heartbeat_user_presence').then(({ error }) => {
        if (error) console.debug('Presence heartbeat could not be refreshed:', error.message);
      });
    };

    heartbeat();
    const interval = window.setInterval(heartbeat, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session?.user?.id, supabase]);

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

  return <AuthContext.Provider value={value}>{children}<FriendsChatLauncher /><FriendRequestPopup userId={session?.user?.id} /></AuthContext.Provider>;
}

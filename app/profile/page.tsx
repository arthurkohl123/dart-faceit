'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { type DartsPlatform, type PlatformStatistic } from '@/components/UnifiedDartsProfile';
import { ProfileV2 } from '@/components/ProfileV2';

type MatchData = {
  id: string | number;
  created_at: string;
  completed_at?: string | null;
  opponent_name?: string;
  is_win?: boolean;
  result?: string;
  match_mode?: 'ranked' | 'private' | null;
  app?: DartsPlatform | null;
};

type ProfileData = {
  username: string | null;
  elo: number;
  gamesPlayed: number;
  wins: number;
  phone_verified: boolean;
  phone_number: string | null;
  is_admin: boolean;
  isPremium: boolean;
  scolia_username: string | null;
  dartcounter_username: string | null;
  autodarts_username: string | null;
  discord_user_id?: string | null;
  discord_username?: string | null;
  discord_avatar?: string | null;
  discord_linked_at?: string | null;
};

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [avgAverage, setAvgAverage] = useState<number>(0);
  const [total180s, setTotal180s] = useState<number>(0);
  const [platformStatistics, setPlatformStatistics] = useState<PlatformStatistic[]>([]);

  // Plattform-Usernamen Bearbeitungsstatus
  const [editingPlatforms, setEditingPlatforms] = useState(false);
  const [scoliaInput, setScoliaInput] = useState('');
  const [dartcounterInput, setDartcounterInput] = useState('');
  const [autodartsInput, setAutodartsInput] = useState('');
  const [savingPlatforms, setSavingPlatforms] = useState(false);
  const [platformSaveMsg, setPlatformSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [discordMsg, setDiscordMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }

      const uid = session.user.id;

      const [{ data: profileData }, { data: matchData }, { data: statisticRows, error: statisticsError }, { data: platformRows, error: platformStatisticsError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('supabaseId', uid).single(),
        supabase.from('matches').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(5),
        supabase.rpc('get_public_player_statistics', { p_user_ids: [uid] }),
        supabase.rpc('get_public_player_platform_statistics', { p_user_ids: [uid] }),
      ]);

      if (!isMounted) return;
      setProfile(profileData ?? null);
      setScoliaInput(profileData?.scolia_username ?? '');
      setDartcounterInput(profileData?.dartcounter_username ?? '');
      setAutodartsInput(profileData?.autodarts_username ?? '');
      setMatches((matchData || []) as MatchData[]);
      if (!statisticsError) {
        const stats = (statisticRows as { average: number | null; total_180s: number }[] | null)?.[0];
        setAvgAverage(stats?.average ?? 0);
        setTotal180s(stats?.total_180s ?? 0);
      } else {
        console.error('Profil-Statistiken konnten nicht geladen werden:', statisticsError);
      }
      if (!platformStatisticsError) {
        setPlatformStatistics((platformRows || []) as PlatformStatistic[]);
      } else {
        console.error('Plattform-Statistiken konnten nicht geladen werden:', platformStatisticsError);
      }
      setLoading(false);

      const discordStatus = new URLSearchParams(window.location.search).get('discord');
      const discordMessages: Record<string, { type: 'success' | 'error' | 'info'; text: string }> = {
        connected: { type: 'success', text: 'Discord ist verbunden. Deine Premium-Rolle wird automatisch synchronisiert.' },
        'role-error': { type: 'error', text: 'Discord ist verbunden, aber die Premium-Rolle konnte noch nicht gesetzt werden. Bitte prüfe die Bot-Rollenhierarchie.' },
        'not-member': { type: 'error', text: 'Bitte tritt zuerst dem RankedDarts-Discord bei und starte die Verknüpfung danach erneut.' },
        'already-linked': { type: 'error', text: 'Dieser Discord-Account ist bereits mit einem anderen RankedDarts-Konto verbunden.' },
        'not-configured': { type: 'error', text: 'Die Discord-Verknüpfung ist noch nicht vollständig konfiguriert.' },
        cancelled: { type: 'info', text: 'Discord-Verknüpfung abgebrochen.' },
        failed: { type: 'error', text: 'Discord konnte nicht verbunden werden. Bitte versuche es erneut.' },
      };
      if (discordStatus && discordMessages[discordStatus]) {
        setDiscordMsg(discordMessages[discordStatus]);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    void load();
    return () => { isMounted = false; };
  }, [supabase, router]);

  const savePlatformUsernames = async () => {
    setSavingPlatforms(true);
    setPlatformSaveMsg(null);
    try {
      const { error } = await supabase.rpc('update_platform_usernames', {
        p_scolia_username:      scoliaInput.trim() || null,
        p_dartcounter_username: dartcounterInput.trim() || null,
        p_autodarts_username:   autodartsInput.trim() || null,
      });
      if (error) throw error;
      setProfile((prev) => prev ? {
        ...prev,
        scolia_username:      scoliaInput.trim() || null,
        dartcounter_username: dartcounterInput.trim() || null,
        autodarts_username:   autodartsInput.trim() || null,
      } : prev);
      setPlatformSaveMsg({ type: 'success', text: 'Gespeichert!' });
      setEditingPlatforms(false);
    } catch (err) {
      setPlatformSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Fehler beim Speichern.' });
    } finally {
      setSavingPlatforms(false);
    }
  };

  const unlinkDiscord = async () => {
    setDiscordBusy(true);
    setDiscordMsg(null);
    try {
      const response = await fetch('/api/discord/unlink', { method: 'POST' });
      const result = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error || 'Discord konnte nicht getrennt werden.');
      setProfile((previous) => previous ? { ...previous, discord_user_id: null, discord_username: null, discord_avatar: null, discord_linked_at: null } : previous);
      setDiscordMsg({ type: result.warning ? 'info' : 'success', text: result.warning || 'Discord wurde getrennt. Eine eventuell vorhandene Premium-Rolle wurde entfernt.' });
    } catch (error) {
      setDiscordMsg({ type: 'error', text: error instanceof Error ? error.message : 'Discord konnte nicht getrennt werden.' });
    } finally {
      setDiscordBusy(false);
    }
  };

  const openPlatformSetup = () => {
    setEditingPlatforms(true);
    setPlatformSaveMsg(null);
    window.setTimeout(() => {
      document.getElementById('platforms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const phoneVerified = Boolean(profile?.phone_verified);
  const hasPlatform = Boolean(profile?.scolia_username || profile?.dartcounter_username || profile?.autodarts_username);
  const connectedApps = (['scolia', 'dartcounter', 'autodarts'] as DartsPlatform[]).filter((app) => {
    if (app === 'scolia') return Boolean(profile?.scolia_username);
    if (app === 'dartcounter') return Boolean(profile?.dartcounter_username);
    return Boolean(profile?.autodarts_username);
  });
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white">
        <div className="border border-white/15 bg-[#0d1110] px-6 py-4 text-lg font-bold text-emerald-200">Profil wird geladen...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
        <div className="border border-rose-300/20 bg-[#0d1110] px-6 py-4 text-sm font-bold text-rose-200">
          Dein Profil konnte nicht geladen werden.
        </div>
      </main>
    );
  }

  return (
    <ProfileV2
      profile={profile}
      matches={matches}
      platformStatistics={platformStatistics}
      overallAverage={avgAverage}
      overall180s={total180s}
      connectedApps={connectedApps}
      mobileMenuOpen={mobileMenuOpen}
      setMobileMenuOpen={setMobileMenuOpen}
      openPlatformSetup={openPlatformSetup}
      primaryAction={() => {
        if (!phoneVerified) {
          router.push('/auth/verify-phone');
        } else if (!hasPlatform) {
          openPlatformSetup();
        } else {
          router.push('/matchmaking');
        }
      }}
      editingPlatforms={editingPlatforms}
      setEditingPlatforms={setEditingPlatforms}
      scoliaInput={scoliaInput}
      dartcounterInput={dartcounterInput}
      autodartsInput={autodartsInput}
      setScoliaInput={setScoliaInput}
      setDartcounterInput={setDartcounterInput}
      setAutodartsInput={setAutodartsInput}
      savePlatformUsernames={savePlatformUsernames}
      savingPlatforms={savingPlatforms}
      platformSaveMsg={platformSaveMsg}
      cancelPlatformEdit={() => {
        setEditingPlatforms(false);
        setScoliaInput(profile?.scolia_username ?? '');
        setDartcounterInput(profile?.dartcounter_username ?? '');
        setAutodartsInput(profile?.autodarts_username ?? '');
        setPlatformSaveMsg(null);
      }}
      startDiscordConnect={() => {
        setDiscordMsg(null);
        window.location.assign('/api/discord/connect?returnTo=/profile');
      }}
      unlinkDiscord={unlinkDiscord}
      discordBusy={discordBusy}
      discordMsg={discordMsg}
    />
  );

}

'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Flame,
  Headphones,
  Link2,
  Menu,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trophy,
  Unlink,
  UsersRound,
  WalletCards,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { AdminBadge } from '@/components/AdminBadge';
import { BrandLogo } from '@/components/BrandLogo';
import { NotificationBell } from '@/components/notification-bell';
import { PayoutAlert } from '@/components/payout-alert';
import { RankBadge } from '@/components/RankBadge';
import {
  type DartsPlatform,
  type PlatformStatistic,
  PlatformBadge,
  UnifiedDartsProfile,
} from '@/components/UnifiedDartsProfile';
import { getRankProgress } from '@/lib/ranks';

const DISCORD_INVITE_URL = 'https://discord.gg/V6u29zEhp';

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
};

type MatchData = {
  id: string | number;
  created_at: string;
  completed_at?: string | null;
  opponent_name?: string;
  is_win?: boolean;
  match_mode?: 'ranked' | 'private' | null;
  app?: DartsPlatform | null;
};

type Props = {
  profile: ProfileData | null;
  matches: MatchData[];
  platformStatistics: PlatformStatistic[];
  overallAverage: number;
  overall180s: number;
  connectedApps: DartsPlatform[];
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  openPlatformSetup: () => void;
  primaryAction: () => void;
  editingPlatforms: boolean;
  setEditingPlatforms: (editing: boolean) => void;
  scoliaInput: string;
  dartcounterInput: string;
  autodartsInput: string;
  setScoliaInput: (value: string) => void;
  setDartcounterInput: (value: string) => void;
  setAutodartsInput: (value: string) => void;
  savePlatformUsernames: () => void;
  savingPlatforms: boolean;
  platformSaveMsg: { type: 'success' | 'error'; text: string } | null;
  cancelPlatformEdit: () => void;
  startDiscordConnect: () => void;
  unlinkDiscord: () => void;
  discordBusy: boolean;
  discordMsg: { type: 'success' | 'error' | 'info'; text: string } | null;
};

function formatCompletion(match: MatchData) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(match.completed_at ?? match.created_at));
}

export function ProfileV2(props: Props) {
  const {
    profile,
    matches,
    platformStatistics,
    overallAverage,
    overall180s,
    connectedApps,
    mobileMenuOpen,
    setMobileMenuOpen,
    openPlatformSetup,
    primaryAction,
    editingPlatforms,
    setEditingPlatforms,
    scoliaInput,
    dartcounterInput,
    autodartsInput,
    setScoliaInput,
    setDartcounterInput,
    setAutodartsInput,
    savePlatformUsernames,
    savingPlatforms,
    platformSaveMsg,
    cancelPlatformEdit,
    startDiscordConnect,
    unlinkDiscord,
    discordBusy,
    discordMsg,
  } = props;

  const elo = profile?.elo ?? 1000;
  const gamesPlayed = profile?.gamesPlayed ?? 0;
  const wins = profile?.wins ?? 0;
  const losses = Math.max(gamesPlayed - wins, 0);
  const winrate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
  const { current: currentRank, upcoming, eloToNext, progress } = getRankProgress(elo);
  const nextRank = upcoming ?? currentRank;
  const phoneVerified = Boolean(profile?.phone_verified);
  const hasPlatform = Boolean(profile?.scolia_username || profile?.dartcounter_username || profile?.autodarts_username);
  const queueReady = phoneVerified && hasPlatform;
  const totalMatches = platformStatistics.reduce((sum, row) => sum + Number(row.match_count || 0), 0);
  const platformAverage = totalMatches > 0
    ? platformStatistics.reduce((sum, row) => sum + Number(row.average || 0) * Number(row.match_count || 0), 0) / totalMatches
    : 0;
  const platform180s = platformStatistics.reduce((sum, row) => sum + Number(row.total_180s || 0), 0);
  const displayedAverage = overallAverage > 0 ? overallAverage : platformAverage;
  const displayed180s = overall180s > 0 ? overall180s : platform180s;
  const nextStep = !phoneVerified
    ? { label: 'Telefon verifizieren', detail: 'Noch ein Schritt bis zum Ranked-Zugang.', href: '/auth/verify-phone', icon: ShieldCheck }
    : !hasPlatform
      ? { label: 'Plattform verbinden', detail: 'Hinterlege Scolia, DartCounter oder AutoDarts für die Queue.', href: '#platforms', icon: Link2 }
      : { label: 'Nächstes Match starten', detail: 'Du bist bereit für die Ranked-Queue.', href: '/matchmaking', icon: Zap };
  const NextStepIcon = nextStep.icon;
  const platformRows = [
    { key: 'scolia', label: 'Scolia', description: 'Kamera-Tracking', value: profile?.scolia_username, input: scoliaInput, setInput: setScoliaInput, tone: 'text-emerald-200', marker: 'bg-emerald-300' },
    { key: 'dartcounter', label: 'DartCounter', description: 'App-Tracking', value: profile?.dartcounter_username, input: dartcounterInput, setInput: setDartcounterInput, tone: 'text-cyan-200', marker: 'bg-cyan-300' },
    { key: 'autodarts', label: 'AutoDarts', description: 'Automatisches Tracking', value: profile?.autodarts_username, input: autodartsInput, setInput: setAutodartsInput, tone: 'text-violet-200', marker: 'bg-violet-300' },
  ] as const;

  return (
    <main className="profile-v2 arena-page relative overflow-hidden text-white">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 sport-grid opacity-20" />
      <nav className="arena-nav fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-[#090d0c]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo className="h-10 w-10 rounded-lg" />
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Player workspace</div>
            </div>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="hover:text-white">Leaderboard</Link>
            <Link href="/tournaments" className="inline-flex items-center gap-1.5 hover:text-white"><Trophy size={14} />Turniere</Link>
            <Link href="/updates" className="hover:text-white">Updates</Link>
            <Link href="/support" className="inline-flex items-center gap-1.5 hover:text-white"><Headphones size={14} />Support</Link>
            <Link href="/friends" className="inline-flex items-center gap-1.5 hover:text-white"><UsersRound size={14} />Freunde</Link>
            <Link href="/premium" className="border border-emerald-300/35 px-3 py-1.5 font-bold text-emerald-200 hover:bg-emerald-300/10">Premium</Link>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="grid h-10 w-10 place-items-center border border-white/15 lg:hidden" aria-label="Menü öffnen">
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 bg-[#090d0c] px-5 py-4 lg:hidden"><div className="flex flex-col gap-1">{[['Matchmaking', '/matchmaking'], ['Leaderboard', '/leaderboard'], ['Turniere', '/tournaments'], ['Match History', '/history'], ['Updates', '/updates'], ['Support', '/support'], ['Freunde & Duelle', '/friends'], ['Premium', '/premium']].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/10 hover:text-white">{label}</Link>)}</div></div>}
      </nav>

      <section className="arena-content relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">
        <PayoutAlert />

        <header className="profile-v6-hero relative mt-5 overflow-hidden py-5 sm:py-8 lg:py-10">
          <div aria-hidden className="profile-v6-glow absolute inset-0" />
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><div className="profile-v2-eyebrow"><Sparkles className="h-3.5 w-3.5" /> Spielerprofil</div><span className="profile-v6-season">RANKED PLAYER / SEASON 01</span></div>
          <div className="profile-v6-layout relative mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,.75fr)] lg:items-center">
            <div className="profile-v6-identity min-w-0">
              <div className="profile-v6-avatar-column"><div className={'profile-v3-avatar profile-v6-avatar relative grid h-20 w-20 shrink-0 place-items-center sm:h-24 sm:w-24 ' + currentRank.ringColor}><RankBadge level={currentRank.level} size="xl" priority /><span className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-full border border-emerald-200/50 bg-emerald-300 text-black"><Zap className="h-4 w-4 fill-current" /></span></div><span className="profile-v6-level-mark">LVL {currentRank.level}</span></div>
              <div className="min-w-0"><div className="profile-v6-name-line"><h1 className="truncate text-4xl font-black leading-none tracking-[-0.08em] sm:text-6xl lg:text-[4.25rem]">{profile?.username || 'Spieler'}</h1></div><div className="mt-3 flex flex-wrap items-center gap-2">{profile?.isPremium && <span className="profile-v3-status profile-v3-status-premium"><Sparkles className="h-3.5 w-3.5 fill-current" />Premium</span>}{profile?.is_admin && <AdminBadge />}</div><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">Dein Wettbewerbsprofil für Ranked-Matches, Turniere und die nächste Runde.</p><div className="profile-v6-status-line mt-4"><span className={currentRank.color}>Level {currentRank.level} · {currentRank.name}</span><span className="profile-v6-status-divider" /><span className={queueReady ? 'text-emerald-200' : 'text-amber-200'}><span className={'mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ' + (queueReady ? 'animate-pulse bg-emerald-300' : 'bg-amber-300')} />{queueReady ? 'Queue bereit' : 'Profil vervollständigen'}</span></div><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={primaryAction} className="arena-primary-action inline-flex items-center px-6 py-3.5 text-sm font-black uppercase tracking-[0.16em]">{!phoneVerified ? 'Verifizieren' : hasPlatform ? 'Match suchen' : 'Plattform einrichten'}<ArrowUpRight className="ml-2 h-4 w-4" /></button><Link href="/history" className="profile-v3-quiet-action inline-flex items-center gap-2 px-5 py-3.5 text-sm font-bold"><Activity className="h-4 w-4" />Match-Verlauf</Link></div></div>
            </div>
            <div className="profile-v6-rating relative lg:border-l lg:border-white/15 lg:pl-9"><div className="profile-v2-label">Aktuelles Rating</div><div className="profile-v6-score-row mt-2"><div><div className="profile-v6-score">{elo}</div><div className="mt-2 text-sm font-bold text-zinc-500">Elo-Punkte</div></div><div className="profile-v6-rank-name"><div className={'text-2xl font-black ' + currentRank.color}>{currentRank.name}</div><div className="mt-1 text-xs text-zinc-500">Level {currentRank.level}</div></div></div><div className="mt-6"><div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500"><span>Fortschritt zum nächsten Rang</span><span className="text-emerald-200">{Math.round(progress)}%</span></div><div className="mt-2 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-emerald-300" style={{ width: progress + '%' }} /></div><div className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>{currentRank.min} {currentRank.name}</span><span>{upcoming ? nextRank.name + ' · ' + nextRank.min : 'Maximal'}</span></div></div></div>
          </div>
          <div className="profile-v6-nav relative mt-9 flex flex-wrap gap-x-7 gap-y-2 border-y border-white/10 py-3 text-xs font-black uppercase tracking-[0.16em]"><a href="#history" className="text-emerald-200 hover:text-white">Matches</a><a href="#platforms" className="text-zinc-500 hover:text-white">Plattformen</a><a href="#discord" className="text-zinc-500 hover:text-white">Discord</a><span className="ml-auto hidden text-zinc-600 sm:inline">{phoneVerified ? 'Fair-Play-Verifizierung aktiv' : 'Verifizierung offen'}</span></div>
        </header>

        <section className="profile-v3-metrics mt-10 grid grid-cols-2 border-y border-white/10 md:grid-cols-4">
          <div><span>Rating</span><strong>{elo}</strong><small>Elo Punkte</small></div>
          <div><span>Winrate</span><strong className={winrate >= 50 ? 'text-emerald-200' : ''}>{winrate}%</strong><small>{wins}W / {losses}L</small></div>
          <div><span>Ø Average</span><strong className="text-amber-200">{displayedAverage > 0 ? displayedAverage.toFixed(1) : '—'}</strong><small>Alle bestätigten Matches</small></div>
          <div><span>180er</span><strong className="text-violet-200">{displayed180s}</strong><small>Gesamt geworfen</small></div>
        </section>

        <section className="mt-10 flex flex-col gap-5 border-y border-emerald-300/20 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4"><div className="profile-v3-command-mark"><NextStepIcon className="h-5 w-5" /></div><div className="min-w-0"><div className="profile-v2-label text-emerald-200">Dein nächster Zug</div><div className="mt-1 text-xl font-black tracking-[-0.04em] text-white">{nextStep.label}</div><p className="mt-1 text-sm text-zinc-400">{nextStep.detail}</p></div></div>
          <Link href={nextStep.href} className="profile-v3-quiet-action inline-flex shrink-0 items-center justify-center gap-2 px-5 py-3 text-sm font-bold">Öffnen <ArrowUpRight className="h-4 w-4" /></Link>
        </section>

        {gamesPlayed === 0 && <section className="profile-v3-first-run mt-10"><div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="profile-v2-label text-indigo-200">Erster Run</div><h2 className="mt-2 text-2xl font-black tracking-[-0.05em]">Dein Setup in drei Schritten.</h2></div><Link href="/getting-started" className="profile-v3-quiet-action inline-flex w-fit items-center gap-2 px-4 py-2.5 text-xs font-black uppercase tracking-[0.12em]"><CircleHelp className="h-4 w-4" />Ablauf ansehen</Link></div><div className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0"><button type="button" onClick={openPlatformSetup} className="group py-6 text-left sm:pr-6"><span className="profile-v2-step-number">01</span><h3 className="mt-4 text-lg font-black">Plattform verbinden</h3><p className="mt-2 text-sm leading-5 text-zinc-500">Scolia, DartCounter oder AutoDarts hinterlegen.</p><span className="mt-4 inline-flex text-xs font-black uppercase tracking-[0.12em] text-emerald-200">{hasPlatform ? 'Erledigt' : 'Jetzt einrichten'} <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></span></button><Link href={queueReady ? '/matchmaking' : '#platforms'} className="group py-6 sm:px-6"><span className="profile-v2-step-number">02</span><h3 className="mt-4 text-lg font-black">Erstes Match finden</h3><p className="mt-2 text-sm leading-5 text-zinc-500">{queueReady ? 'Du bist bereit für die Ranked-Queue.' : 'Verifizierung und Plattform abschließen.'}</p><span className="mt-4 inline-flex text-xs font-black uppercase tracking-[0.12em] text-emerald-200">{queueReady ? 'Queue öffnen' : 'Voraussetzungen'} <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></span></Link><a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="group py-6 sm:pl-6"><span className="profile-v2-step-number">03</span><h3 className="mt-4 text-lg font-black">Community treffen</h3><p className="mt-2 text-sm leading-5 text-zinc-500">Finde Gegner, Updates und Hilfe auf Discord.</p><span className="mt-4 inline-flex text-xs font-black uppercase tracking-[0.12em] text-indigo-200">Discord öffnen <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></span></a></div></section>}

        <div className="mt-14 grid gap-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
          <div className="min-w-0">
            <section id="history" className="profile-v3-section scroll-mt-28">
              <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-5"><div><div className="profile-v2-label">Form</div><h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">Letzte Matches</h2></div><Link href="/history" className="profile-v2-text-link">Alle ansehen <ArrowUpRight className="h-4 w-4" /></Link></div>
              {matches.length === 0 ? <div className="py-12 text-sm text-zinc-500">Noch keine Matches gespielt.</div> : <div className="mt-2">{matches.map((match) => <div key={match.id} className="profile-v3-match-row"><div className={'profile-v3-match-dot ' + (match.is_win ? 'is-win' : 'is-loss')} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="truncate text-base font-bold text-white">vs. {match.opponent_name ?? 'Unbekannter Gegner'}</div><PlatformBadge app={match.app} />{match.match_mode === 'private' && <span className="profile-v2-mini-tag">Privat</span>}</div><div className="mt-1 text-xs text-zinc-500">{formatCompletion(match)}</div></div><div className={'text-right text-xs font-black uppercase tracking-[0.14em] ' + (match.is_win ? 'text-emerald-200' : 'text-rose-200')}>{match.is_win ? 'Sieg' : 'Niederlage'}</div></div>)}</div>}
            </section>

            <section id="platforms" className="profile-v3-section mt-16 scroll-mt-28">
              <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="profile-v2-label">Verbindungen</div><h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">Deine Plattformen</h2><p className="mt-2 text-sm text-zinc-500">Welche Systeme deine Ranked-Ergebnisse liefern.</p></div>{!editingPlatforms && <button type="button" onClick={() => setEditingPlatforms(true)} className="profile-v3-quiet-action inline-flex w-fit items-center gap-2 px-4 py-2.5 text-sm font-bold"><Pencil size={14} />Bearbeiten</button>}</div>
              <div className="mt-2">{platformRows.map((platform) => <div key={platform.key} className="profile-v3-platform-row"><span className={'profile-v2-platform-marker ' + platform.marker} /><div className="min-w-0 flex-1"><div className="text-base font-black text-white">{platform.label}</div><div className="mt-1 text-xs text-zinc-500">{platform.description}</div></div>{editingPlatforms ? <input type="text" value={platform.input} onChange={(event) => platform.setInput(event.target.value)} placeholder={platform.label + '-Username'} maxLength={100} className="profile-v2-input w-full sm:w-64" /> : <div className={'text-sm font-bold ' + (platform.value ? platform.tone : 'text-zinc-600')}>{platform.value || 'Nicht hinterlegt'}</div>}<span className={platform.value ? 'text-emerald-300' : 'text-zinc-700'}>{platform.value ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</span></div>)}</div>
              {editingPlatforms && <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={savePlatformUsernames} disabled={savingPlatforms} className="arena-primary-action inline-flex items-center gap-2 px-5 py-2.5 text-sm font-black"><Save size={14} />{savingPlatforms ? 'Speichern...' : 'Speichern'}</button><button type="button" onClick={cancelPlatformEdit} className="profile-v3-quiet-action inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold"><X size={14} />Abbrechen</button>{platformSaveMsg && <span className={'text-sm font-bold ' + (platformSaveMsg.type === 'success' ? 'text-emerald-300' : 'text-red-300')}>{platformSaveMsg.text}</span>}</div>}
              {!hasPlatform && !editingPlatforms && <div className="mt-5 border-l-2 border-amber-300/40 py-2 pl-4 text-sm text-amber-200">Hinterlege mindestens einen Plattform-Account, um am Matchmaking teilzunehmen.</div>}
            </section>
            <section className="profile-v3-section mt-16"><div className="border-b border-white/10 pb-5"><div className="profile-v2-label">Auswertung</div><h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">Deine Plattform-Performance</h2><p className="mt-2 text-sm text-zinc-500">Alle bestätigten Werte an einem Ort.</p></div><div className="mt-8"><UnifiedDartsProfile statistics={platformStatistics} connectedApps={connectedApps} /></div></section>
          </div>

          <aside className="min-w-0">
            <section className="profile-v3-side-section"><div className="profile-v2-label">Rank journey</div><h2 className="mt-2 text-2xl font-black tracking-[-0.05em]">Der nächste Schritt</h2><div className="mt-7 flex items-end justify-between gap-4"><div><div className={'text-2xl font-black ' + currentRank.color}>{currentRank.name}</div><div className="mt-1 text-xs text-zinc-500">Aktueller Rang</div></div><div className="text-right"><div className="text-2xl font-black text-white">{Math.round(progress)}%</div><div className="mt-1 text-xs text-zinc-500">Fortschritt</div></div></div><div className="mt-4 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-emerald-300" style={{ width: progress + '%' }} /></div><div className="mt-3 flex justify-between text-xs text-zinc-500"><span>{elo} Elo</span><span>{eloToNext > 0 ? eloToNext + ' bis ' + nextRank.name : 'Maximaler Rang'}</span></div></section>
            {!phoneVerified && <section className="profile-v3-side-section mt-10 border-l-2 border-amber-300/50 pl-5"><div className="profile-v2-label text-amber-200">Noch offen</div><h2 className="mt-2 text-2xl font-black tracking-[-0.05em]">Telefon verifizieren</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Bestätige deine Nummer, bevor du vollständig in Ranked startest.</p><Link href={profile?.phone_number ? '/auth/verify-phone?phone=' + encodeURIComponent(profile.phone_number) : '/auth/verify-phone'} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-amber-200 hover:text-white">Jetzt erledigen <ArrowUpRight className="h-4 w-4" /></Link></section>}
            <section className="profile-v3-side-section mt-10"><div className="profile-v2-label">Momentum</div><div className="mt-3 flex items-center gap-3"><Flame className="h-5 w-5 text-amber-300" /><span className="text-3xl font-black text-white">{gamesPlayed}</span><span className="text-sm text-zinc-500">Matches</span></div><div className="mt-4 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden bg-white/10"><div className="h-full bg-emerald-300" style={{ width: Math.max(winrate, 8) + '%' }} /></div><span className="text-xs font-bold text-emerald-200">{wins} Siege</span></div></section>
            <Link href="/friends" className="profile-v3-feature-link group mt-10 flex items-start gap-4 border-t border-emerald-300/25 py-5"><UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><span className="min-w-0 flex-1"><span className="profile-v2-label text-emerald-200">Private Duelle</span><span className="mt-1 block text-lg font-black text-white">Freunde herausfordern</span><span className="mt-1 block text-sm leading-5 text-zinc-500">Online-Spieler finden und Best-of-Duelle starten.</span></span><ArrowUpRight className="h-5 w-5 shrink-0 text-emerald-200 transition group-hover:-translate-y-1 group-hover:translate-x-1" /></Link>
            <Link href="/account" className="mt-8 flex items-center gap-3 border-t border-white/10 pt-5 text-sm font-bold text-zinc-400 hover:text-white"><WalletCards className="h-4 w-4 text-emerald-300" />Konto & Auszahlungen <ArrowUpRight className="ml-auto h-4 w-4" /></Link>
          </aside>
        </div>

        <section id="discord" className="profile-v3-discord mt-16 scroll-mt-28"><div className="flex flex-col gap-7 border-y border-indigo-300/20 py-8 lg:flex-row lg:items-center lg:justify-between"><div className="flex min-w-0 items-start gap-4"><div className="profile-v3-discord-mark"><Link2 className="h-5 w-5" /></div><div className="min-w-0"><div className="profile-v2-label text-indigo-200">Community-Verbindung</div><h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">Discord</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Bei aktivem Premium wird deine Discord-Rolle automatisch synchronisiert.</p></div></div>{profile?.discord_user_id ? <div className="flex flex-col gap-2 lg:items-end"><div className="inline-flex items-center gap-2 text-sm font-black text-emerald-200"><CheckCircle2 className="h-4 w-4" />{profile.discord_username || 'Discord verbunden'}</div><div className="flex flex-wrap gap-2 lg:justify-end"><button type="button" onClick={startDiscordConnect} className="profile-v3-quiet-action inline-flex items-center gap-2 px-3 py-2 text-xs font-black text-indigo-100"><RefreshCw className="h-3.5 w-3.5" />Neu verbinden</button><button type="button" onClick={unlinkDiscord} disabled={discordBusy} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-black text-rose-200 hover:text-white disabled:opacity-50"><Unlink className="h-3.5 w-3.5" />{discordBusy ? 'Wird getrennt …' : 'Trennen'}</button></div></div> : <button type="button" onClick={startDiscordConnect} className="profile-v3-discord-button inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-black"><Link2 className="h-4 w-4" />Mit Discord verbinden</button>}</div><div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 text-xs text-zinc-600"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" />Sicherer OAuth-Login</span><span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-200" />Premium-Rolle automatisch</span><span>Jederzeit trennbar</span></div>{discordMsg && <p className={'mt-4 text-sm font-bold ' + (discordMsg.type === 'success' ? 'text-emerald-300' : discordMsg.type === 'info' ? 'text-cyan-200' : 'text-rose-300')}>{discordMsg.text}</p>}</section>
        <div className="mt-14 border-t border-white/10 pt-7 text-center text-xs text-zinc-600">RankedDarts Player Workspace · Season 01</div>
      </section>
    </main>
  );
}

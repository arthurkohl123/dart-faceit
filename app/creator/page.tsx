'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, CheckCircle2, ChevronRight, CircleAlert, Clock3, Copy, Headphones, Link2, Megaphone, Radio, ShieldCheck, Trophy, Users, XCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { NotificationBell } from '@/components/notification-bell';

type Platform = 'scolia' | 'dartcounter' | 'autodarts';
type TournamentFormat = 'single_elimination' | 'double_elimination' | 'group_stage';
type DartMode = 'straight_in_double_out' | 'double_in_double_out';
type TournamentStatus = 'registration' | 'live' | 'completed' | 'cancelled';
type CreatorTournament = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  registration_closes_at: string;
  check_in_opens_at: string;
  check_in_closes_at: string;
  max_players: number;
  best_of: number;
  status: TournamentStatus;
  scoring_platform: Platform;
  tournament_format: TournamentFormat;
  dart_mode: DartMode;
  participant_count: number;
  checked_in_count: number;
  waitlist_count: number;
  creator_announcement_sent_at: string | null;
  creator_announcement_error: string | null;
  created_at: string;
};
type Participant = {
  username: string;
  status: 'registered' | 'checked_in' | 'waitlisted';
  checked_in_at: string | null;
  average_snapshot: number | null;
  joined_at: string;
  waitlist_position: number | null;
};
type Notice = { tone: 'success' | 'error' | 'info'; text: string };
type ReferralStats = {
  referral_code: string;
  registrations: number;
  first_ranked_matches: number;
  latest_registration_at: string | null;
};
type CreatorSupportTicket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};
type CreatorForm = {
  title: string;
  description: string;
  startsAt: string;
  registrationClosesAt: string;
  maxPlayers: '4' | '8' | '16' | '32';
  bestOf: '3' | '5' | '7' | '9';
  platform: Platform;
  format: TournamentFormat;
  dartMode: DartMode;
};

const platformLabels: Record<Platform, string> = { scolia: 'Scolia', dartcounter: 'DartCounter', autodarts: 'AutoDarts' };
const formatLabels: Record<TournamentFormat, string> = { single_elimination: 'Single Elimination', double_elimination: 'Double Elimination', group_stage: 'Gruppenphase' };
const statusMeta: Record<TournamentStatus, { label: string; className: string }> = {
  registration: { label: 'ANMELDUNG', className: 'border-emerald-300/25 bg-emerald-300/[.09] text-emerald-100' },
  live: { label: 'LIVE', className: 'border-rose-300/25 bg-rose-300/[.1] text-rose-100' },
  completed: { label: 'BEENDET', className: 'border-white/10 bg-white/[.04] text-zinc-300' },
  cancelled: { label: 'ABGESAGT', className: 'border-rose-300/20 bg-rose-300/[.07] text-rose-200' },
};

function dateInputValue(value: Date) {
  const two = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${two(value.getMonth() + 1)}-${two(value.getDate())}T${two(value.getHours())}:${two(value.getMinutes())}`;
}

function defaultCreatorForm(): CreatorForm {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(20, 0, 0, 0);
  const registration = new Date(start.getTime() - 30 * 60_000);
  return {
    title: '', description: '', startsAt: dateInputValue(start), registrationClosesAt: dateInputValue(registration),
    maxPlayers: '16', bestOf: '5', platform: 'dartcounter', format: 'single_elimination', dartMode: 'straight_in_double_out',
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function errorText(message: string) {
  if (message.includes('STREAMER_ACCESS_REQUIRED')) return 'Diese Seite ist nur für bestätigte RankedDarts-Streamer verfügbar.';
  if (message.includes('STREAMER_TOURNAMENT_ACCESS_REQUIRED')) return 'Du hast keinen Zugriff auf dieses Turnier.';
  return message;
}

export default function CreatorHubPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tournaments, setTournaments] = useState<CreatorTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [form, setForm] = useState<CreatorForm>(defaultCreatorForm);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [participantsFor, setParticipantsFor] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scheduleFor, setScheduleFor] = useState<CreatorTournament | null>(null);
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleRegistration, setScheduleRegistration] = useState('');
  const [cancelFor, setCancelFor] = useState<CreatorTournament | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [creatorTickets, setCreatorTickets] = useState<CreatorSupportTicket[]>([]);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');

  const load = useCallback(async () => {
    const [tournamentResponse, referralResponse, supportResponse] = await Promise.all([
      supabase.rpc('streamer_list_my_tournaments'),
      supabase.rpc('streamer_get_referral_stats'),
      supabase.rpc('streamer_list_creator_support_tickets'),
    ]);
    if (tournamentResponse.error) {
      setAccessDenied(true);
      setNotice({ tone: 'error', text: errorText(tournamentResponse.error.message) });
      return;
    }
    setAccessDenied(false);
    setTournaments((tournamentResponse.data ?? []) as CreatorTournament[]);
    setReferral(((referralResponse.data ?? [])[0] ?? null) as ReferralStats | null);
    setCreatorTickets((supportResponse.data ?? []) as CreatorSupportTicket[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth/login?redirectTo=%2Fcreator'); return; }
      await load();
      setLoading(false);
    })();
  }, [load, router, supabase]);

  const activeTournament = tournaments.find((tournament) => tournament.status === 'registration' || tournament.status === 'live') ?? null;

  async function announce(tournamentId: string, created = false) {
    setPending(`announce:${tournamentId}`);
    const response = await fetch('/api/streamer/tournaments/announce', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId }), cache: 'no-store',
    });
    const result = await response.json().catch(() => null) as { error?: string; alreadySent?: boolean } | null;
    setPending(null);
    if (!response.ok) {
      setNotice({ tone: 'error', text: created ? `Turnier ist veröffentlicht, aber Discord konnte nicht benachrichtigt werden: ${result?.error || 'Unbekannter Fehler'}` : result?.error || 'Discord-Ankündigung konnte nicht gesendet werden.' });
      await load();
      return;
    }
    setNotice({ tone: 'success', text: result?.alreadySent ? 'Der Discord-Beitrag wurde bereits gesendet.' : created ? 'Turnier veröffentlicht und im Discord angekündigt.' : 'Discord-Ankündigung wurde gesendet.' });
    await load();
  }

  async function createTournament() {
    setCreating(true);
    setNotice(null);
    const startsAt = new Date(form.startsAt);
    const registrationClosesAt = new Date(form.registrationClosesAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(registrationClosesAt.getTime())) {
      setCreating(false);
      setNotice({ tone: 'error', text: 'Bitte wähle einen gültigen Anmelde- und Startzeitpunkt.' });
      return;
    }
    const { data: tournamentId, error } = await supabase.rpc('streamer_create_tournament', {
      p_title: form.title,
      p_description: form.description,
      p_starts_at: startsAt.toISOString(),
      p_registration_closes_at: registrationClosesAt.toISOString(),
      p_max_players: Number(form.maxPlayers),
      p_best_of: Number(form.bestOf),
      p_scoring_platform: form.platform,
      p_tournament_format: form.format,
      p_dart_mode: form.dartMode,
    });
    setCreating(false);
    if (error || !tournamentId) {
      setNotice({ tone: 'error', text: errorText(error?.message || 'Turnier konnte nicht erstellt werden.') });
      return;
    }
    setForm(defaultCreatorForm());
    await load();
    await announce(String(tournamentId), true);
  }

  async function openParticipants(tournamentId: string) {
    setParticipantsFor(tournamentId);
    setParticipants([]);
    const { data, error } = await supabase.rpc('streamer_list_tournament_participants', { p_tournament_id: tournamentId });
    if (error) {
      setNotice({ tone: 'error', text: errorText(error.message) });
      setParticipantsFor(null);
      return;
    }
    setParticipants((data ?? []) as Participant[]);
  }

  async function saveSchedule() {
    if (!scheduleFor) return;
    const startsAt = new Date(scheduleStart);
    const registrationClosesAt = new Date(scheduleRegistration);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(registrationClosesAt.getTime())) {
      setNotice({ tone: 'error', text: 'Bitte wähle einen gültigen Zeitplan.' });
      return;
    }
    setPending(`schedule:${scheduleFor.id}`);
    const { error } = await supabase.rpc('streamer_update_tournament_schedule', {
      p_tournament_id: scheduleFor.id,
      p_registration_closes_at: registrationClosesAt.toISOString(),
      p_starts_at: startsAt.toISOString(),
    });
    setPending(null);
    if (error) { setNotice({ tone: 'error', text: errorText(error.message) }); return; }
    setScheduleFor(null);
    setNotice({ tone: 'success', text: 'Zeitplan gespeichert. Alle angemeldeten Spieler wurden benachrichtigt.' });
    await load();
  }

  async function cancelTournament() {
    if (!cancelFor) return;
    setPending(`cancel:${cancelFor.id}`);
    const { error } = await supabase.rpc('streamer_cancel_tournament', {
      p_tournament_id: cancelFor.id,
      p_reason: cancelReason,
    });
    setPending(null);
    if (error) { setNotice({ tone: 'error', text: errorText(error.message) }); return; }
    setCancelFor(null);
    setCancelReason('');
    setNotice({ tone: 'success', text: 'Turnier abgesagt. Alle angemeldeten Spieler wurden benachrichtigt.' });
    await load();
  }

  const referralLink = referral && typeof window !== 'undefined'
    ? `${window.location.origin}/r/${referral.referral_code}`
    : '';

  async function copyReferralLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setNotice({ tone: 'success', text: 'Dein persönlicher Creator-Link wurde kopiert.' });
    } catch {
      setNotice({ tone: 'info', text: `Kopiere diesen Link: ${referralLink}` });
    }
  }

  async function createCreatorSupportTicket() {
    setPending('creator-support');
    const { error } = await supabase.rpc('streamer_create_creator_support_ticket', {
      p_subject: supportSubject,
      p_message: supportMessage,
    });
    setPending(null);
    if (error) {
      setNotice({ tone: 'error', text: errorText(error.message) });
      return;
    }
    setSupportSubject('');
    setSupportMessage('');
    setNotice({ tone: 'success', text: 'Deine Creator-Anfrage ist beim Team angekommen.' });
    await load();
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#09070d] text-zinc-400">Creator Hub wird geladen …</main>;
  if (accessDenied) return <main className="grid min-h-screen place-items-center bg-[#09070d] px-5 text-center text-zinc-300"><div className="max-w-md"><Radio className="mx-auto h-10 w-10 text-fuchsia-300" /><h1 className="mt-5 text-3xl font-black text-white">Creator Hub</h1><p className="mt-3 leading-6 text-zinc-400">Diese Seite steht bestätigten RankedDarts-Streamern zur Verfügung.</p><Link href="/streamers" className="mt-6 inline-flex items-center gap-2 border border-fuchsia-300/30 bg-fuchsia-300/10 px-4 py-3 text-sm font-bold text-fuchsia-100"><ArrowLeft size={15} /> Zur Streamer-Übersicht</Link></div></main>;

  return <main className="relative min-h-screen overflow-x-hidden bg-[#09070d] text-white selection:bg-fuchsia-300 selection:text-black">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[46rem] bg-[radial-gradient(circle_at_8%_10%,rgba(217,70,239,.18),transparent_24%),radial-gradient(circle_at_88%_12%,rgba(45,212,191,.13),transparent_25%),linear-gradient(180deg,#160d1b_0%,#09070d_68%)]" />
    <nav className="relative mx-auto flex max-w-[84rem] items-center justify-between px-5 py-5 md:px-8"><Link href="/tournaments" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white"><ArrowLeft size={16} /> Turnierübersicht</Link><NotificationBell /></nav>
    <section className="relative mx-auto max-w-[84rem] px-5 pb-9 pt-4 md:px-8 md:pt-9">
      <div className="overflow-hidden rounded-[2rem] border border-fuchsia-300/20 bg-[#160f1b]/85 shadow-[0_32px_100px_rgba(0,0,0,.35)] backdrop-blur-sm">
        <div className="grid gap-8 px-6 py-8 md:px-10 md:py-11 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-end"><div><p className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-300/[.1] px-3 py-1.5 text-[10px] font-black tracking-[.18em] text-fuchsia-100"><Radio size={12} /> RANKEDDARTS CREATOR HUB</p><h1 className="mt-6 text-5xl font-black leading-[.88] tracking-[-.065em] sm:text-7xl">Deine Community.<br /><span className="text-fuchsia-300">Dein Cup.</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-300/75">Erstelle kostenlose Community-Turniere für deinen Stream. Check-in, Matchrooms und Turnierbaum laufen direkt über RankedDarts.</p></div><div className="grid overflow-hidden rounded-2xl border border-white/10 bg-black/25"><CreatorMetric value={String(tournaments.filter((tournament) => tournament.status === 'registration').length)} label="GEPLANT" tone="fuchsia" /><CreatorMetric value={String(tournaments.filter((tournament) => tournament.status === 'live').length)} label="LIVE" tone="rose" /><CreatorMetric value={String(tournaments.reduce((count, tournament) => count + Number(tournament.participant_count), 0))} label="STARTER GESAMT" tone="mint" /></div></div>
        <div className="grid border-t border-white/10 bg-black/20 px-6 py-3 text-[11px] text-zinc-400 md:grid-cols-3 md:px-10"><span className="flex items-center gap-2"><ShieldCheck size={14} className="text-fuchsia-200" />Kostenlos &amp; öffentlich</span><span className="mt-2 flex items-center gap-2 md:mt-0"><Clock3 size={14} className="text-teal-200" />Check-in und Start automatisch</span><span className="mt-2 flex items-center gap-2 md:mt-0"><CircleAlert size={14} className="text-amber-200" />Streitfälle bleiben beim Team</span></div>
      </div>
    </section>

    <section className="relative mx-auto grid max-w-[84rem] gap-7 px-5 pb-16 md:px-8 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="space-y-7">
        {notice && <NoticeBox notice={notice} onDismiss={() => setNotice(null)} />}
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#110d14] shadow-[0_20px_70px_rgba(0,0,0,.2)]"><header className="flex flex-col gap-4 border-b border-white/10 px-6 py-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black tracking-[.2em] text-fuchsia-200">COMMUNITY CUP ERSTELLEN</p><h2 className="mt-2 text-3xl font-black tracking-[-.05em]">Neue Bühne eröffnen.</h2></div><span className="inline-flex w-fit items-center gap-2 border border-teal-300/20 bg-teal-300/[.08] px-3 py-2 text-[10px] font-black tracking-[.12em] text-teal-100"><ShieldCheck size={13} /> SICHERE VORLAGE</span></header>
          {activeTournament ? <div className="p-6"><div className="border border-amber-300/25 bg-amber-300/[.07] p-5"><p className="text-sm font-black text-amber-100">Du hast bereits ein aktives Community-Event.</p><p className="mt-2 text-sm leading-6 text-zinc-300">Für eine klare Planung kannst du erst ein neues Turnier erstellen, wenn „{activeTournament.title}“ beendet oder abgesagt wurde.</p><Link href={`/tournaments/${activeTournament.id}`} className="mt-4 inline-flex items-center gap-2 border border-amber-300/30 px-4 py-2.5 text-xs font-black text-amber-100"><Trophy size={14} /> Turnier öffnen <ChevronRight size={14} /></Link></div></div> : <div className="grid gap-4 p-6 md:grid-cols-2"><FormField label="Turniertitel" className="md:col-span-2"><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={80} placeholder="z. B. LeonKohl Community Cup" className={inputClass} /></FormField><FormField label="Beschreibung" className="md:col-span-2"><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} maxLength={1200} placeholder="Worum geht es heute im Cup? Erwähne gern deinen Stream oder besondere Regeln." className={`${inputClass} min-h-28 resize-y`} /></FormField><FormField label="Anmeldung bis"><input type="datetime-local" value={form.registrationClosesAt} onChange={(event) => setForm((current) => ({ ...current, registrationClosesAt: event.target.value }))} className={inputClass} /></FormField><FormField label="Turnierstart"><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} className={inputClass} /></FormField><FormField label="Plattform"><select value={form.platform} onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value as Platform }))} className={inputClass}><option value="dartcounter">DartCounter</option><option value="scolia">Scolia</option><option value="autodarts">AutoDarts</option></select></FormField><FormField label="Format"><select value={form.format} onChange={(event) => setForm((current) => ({ ...current, format: event.target.value as TournamentFormat }))} className={inputClass}><option value="single_elimination">Single Elimination</option><option value="double_elimination">Double Elimination</option><option value="group_stage">Gruppenphase</option></select></FormField><FormField label="Teilnehmer"><select value={form.maxPlayers} onChange={(event) => setForm((current) => ({ ...current, maxPlayers: event.target.value as CreatorForm['maxPlayers'] }))} className={inputClass}><option value="4">4 Spieler</option><option value="8">8 Spieler</option><option value="16">16 Spieler</option><option value="32">32 Spieler</option></select></FormField><FormField label="Best of"><select value={form.bestOf} onChange={(event) => setForm((current) => ({ ...current, bestOf: event.target.value as CreatorForm['bestOf'] }))} className={inputClass}><option value="3">Best of 3</option><option value="5">Best of 5</option><option value="7">Best of 7</option><option value="9">Best of 9</option></select></FormField><FormField label="Spielmodus" className="md:col-span-2"><select value={form.dartMode} onChange={(event) => setForm((current) => ({ ...current, dartMode: event.target.value as DartMode }))} className={inputClass}><option value="straight_in_double_out">Single In · Double Out</option><option value="double_in_double_out">Double In · Double Out</option></select></FormField><div className="md:col-span-2 border border-fuchsia-300/20 bg-fuchsia-300/[.06] px-4 py-3 text-xs leading-5 text-fuchsia-50/80"><b className="text-fuchsia-100">Creator-Regeln:</b> Das Event ist kostenlos, öffentlich und ohne Preisgeld. Der Check-in startet 20 Minuten vor Beginn. Nach dem Erstellen wird ein Discord-Beitrag ohne @everyone-Ping gesendet.</div><div className="md:col-span-2"><button type="button" onClick={() => void createTournament()} disabled={creating} className="inline-flex items-center gap-2 bg-gradient-to-r from-fuchsia-300 to-violet-300 px-6 py-3.5 text-xs font-black uppercase tracking-[.12em] text-[#170a1c] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"><Trophy size={15} />{creating ? 'WIRD VERÖFFENTLICHT …' : 'COMMUNITY CUP VERÖFFENTLICHEN'}</button></div></div>}</section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#110d14]"><header className="flex items-center justify-between border-b border-white/10 px-6 py-5"><div><p className="text-[10px] font-black tracking-[.2em] text-teal-200">MEINE TURNIERE</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">Deine Events im Blick.</h2></div><span className="text-xs font-bold text-zinc-500">{tournaments.length} gesamt</span></header>{tournaments.length === 0 ? <div className="p-10 text-center"><Trophy className="mx-auto text-zinc-600" /><p className="mt-4 font-bold text-zinc-300">Dein erster Community Cup wartet.</p><p className="mt-2 text-sm text-zinc-500">Erstelle oben ein kostenloses Turnier für deine Community.</p></div> : <div className="divide-y divide-white/10">{tournaments.map((tournament) => <CreatorTournamentRow key={tournament.id} tournament={tournament} pending={pending} onParticipants={() => void openParticipants(tournament.id)} onAnnounce={() => void announce(tournament.id)} onSchedule={() => { setScheduleFor(tournament); setScheduleStart(dateInputValue(new Date(tournament.starts_at))); setScheduleRegistration(dateInputValue(new Date(tournament.registration_closes_at))); }} onCancel={() => { setCancelFor(tournament); setCancelReason(''); }} />)}</div>}</section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
        <section className="border border-fuchsia-300/25 bg-gradient-to-br from-fuchsia-300/[.1] to-violet-300/[.04] p-5">
          <Radio className="h-5 w-5 text-fuchsia-200" />
          <p className="mt-5 text-[10px] font-black tracking-[.17em] text-fuchsia-100">DEINE ROLLE</p>
          <h2 className="mt-2 text-xl font-black">Du bringst die Community zusammen.</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300/80">Du planst das Event, begleitest es im Stream und behältst Teilnehmer sowie Bracket im Blick.</p>
        </section>

        <section className="overflow-hidden border border-teal-300/25 bg-gradient-to-br from-teal-300/[.1] to-cyan-300/[.035] p-5">
          <div className="flex items-start justify-between gap-3"><div><Link2 className="h-5 w-5 text-teal-100" /><p className="mt-4 text-[10px] font-black tracking-[.17em] text-teal-100">DEIN CREATOR-LINK</p></div><span className="border border-teal-300/20 bg-black/20 px-2 py-1 text-[9px] font-black tracking-[.1em] text-teal-100">PERSÖNLICH</span></div>
          <p className="mt-3 text-sm leading-6 text-zinc-200">Teile ihn im Stream, in deiner Bio oder im Discord. Gezählt werden Anmeldungen und das erste bestätigte Ranked-Match.</p>
          <div className="mt-4 break-all border border-white/10 bg-black/30 px-3 py-3 font-mono text-[11px] leading-5 text-teal-50">{referralLink || 'Creator-Link wird vorbereitet …'}</div>
          <button type="button" onClick={() => void copyReferralLink()} disabled={!referralLink} className="mt-3 inline-flex w-full items-center justify-center gap-2 bg-teal-200 px-4 py-3 text-[10px] font-black tracking-[.12em] text-[#06221f] transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"><Copy size={14} />LINK KOPIEREN</button>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-white/10 bg-white/10"><div className="bg-[#10201f] px-3 py-3"><b className="block text-2xl tracking-[-.05em] text-white">{referral?.registrations ?? 0}</b><span className="mt-1 block text-[9px] font-black tracking-[.1em] text-zinc-400">ANMELDUNGEN</span></div><div className="bg-[#10201f] px-3 py-3"><b className="block text-2xl tracking-[-.05em] text-white">{referral?.first_ranked_matches ?? 0}</b><span className="mt-1 block text-[9px] font-black tracking-[.1em] text-zinc-400">ERSTE MATCHES</span></div></div>
          <p className="mt-3 text-[11px] leading-5 text-zinc-500">Keine Klick-, IP- oder Browser-Auswertung. Nur erfolgreiche Registrierungen und gespielte Matches.</p>
        </section>

        <section className="border border-amber-300/25 bg-amber-300/[.055] p-5">
          <Headphones className="h-5 w-5 text-amber-200" />
          <p className="mt-4 text-[10px] font-black tracking-[.17em] text-amber-100">CREATOR-SUPPORT</p>
          <h2 className="mt-2 text-lg font-black text-white">Direkter Draht zum Team.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300/80">Fragen zu deinem Stream, Community-Cup oder einer Zusammenarbeit landen als priorisierte Anfrage beim Team.</p>
          <label className="mt-4 block"><span className="text-[10px] font-black tracking-[.13em] text-zinc-400">BETREFF</span><input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} maxLength={120} placeholder="Worum geht es?" className={`${inputClass} border-amber-300/15 focus:border-amber-200/60`} /></label>
          <label className="mt-3 block"><span className="text-[10px] font-black tracking-[.13em] text-zinc-400">NACHRICHT</span><textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} maxLength={4000} placeholder="Beschreibe kurz, wobei wir helfen können." className={`${inputClass} min-h-28 resize-y border-amber-300/15 focus:border-amber-200/60`} /></label>
          <button type="button" onClick={() => void createCreatorSupportTicket()} disabled={pending === 'creator-support' || supportSubject.trim().length < 3 || supportMessage.trim().length < 10} className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-[10px] font-black tracking-[.12em] text-amber-50 transition hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-50"><Headphones size={14} />{pending === 'creator-support' ? 'WIRD GESENDET …' : 'ANFRAGE SENDEN'}</button>
          {creatorTickets.length > 0 && <div className="mt-4 border-t border-amber-300/15 pt-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black tracking-[.13em] text-amber-100">LETZTE ANFRAGE</span><Link href="/support" className="text-[10px] font-black tracking-[.1em] text-amber-100 hover:text-white">ALLE ÖFFNEN</Link></div><p className="mt-2 truncate text-sm font-bold text-zinc-100">{creatorTickets[0].subject}</p><p className="mt-1 text-xs text-zinc-500">{creatorTickets[0].status === 'open' ? 'Offen beim Team' : creatorTickets[0].status} · {formatDate(creatorTickets[0].updated_at)}</p></div>}
        </section>

        <PolicyCard icon={<CheckCircle2 />} title="Das kannst du" points={['Kostenlose Cups erstellen', 'Zeitplan anpassen & absagen', 'Teilnehmer und Check-in sehen', 'Discord-Beitrag für dein Event']} />
        <PolicyCard icon={<ShieldCheck />} title="Das bleibt geschützt" points={['Keine Preisgelder oder Startgebühren', 'Keine Ergebniseingriffe', 'Keine Turniere anderer Creator', 'Keine Admin- oder Moderationsrechte']} />
        <section className="border border-white/10 bg-black/20 p-5"><p className="text-[10px] font-black tracking-[.17em] text-zinc-500">BEI STREITFÄLLEN</p><p className="mt-3 text-sm leading-6 text-zinc-400">Spieler melden Probleme direkt am Turniermatch. Das RankedDarts-Team entscheidet – du musst keine Ergebnisse selbst verändern.</p></section>
      </aside>
    </section>

    {participantsFor && <Modal title="Teilnehmerliste" onClose={() => setParticipantsFor(null)}><div className="max-h-[65vh] overflow-y-auto"><p className="mb-4 text-sm text-zinc-400">{participants.length} aktive Anmeldung{participants.length === 1 ? '' : 'en'} in diesem Turnier.</p>{participants.length === 0 ? <p className="border border-dashed border-white/15 p-5 text-sm text-zinc-500">Noch keine Teilnehmer angemeldet.</p> : <div className="divide-y divide-white/10 border border-white/10">{participants.map((participant) => <div key={`${participant.username}:${participant.joined_at}`} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white">{participant.username}</p><p className="mt-1 text-[10px] text-zinc-500">{participant.average_snapshot === null ? 'Kein AVG gespeichert' : `Ø ${Number(participant.average_snapshot).toFixed(1)}`}</p></div><ParticipantStatus participant={participant} /></div>)}</div>}</div></Modal>}
    {scheduleFor && <Modal title="Zeitplan ändern" onClose={() => setScheduleFor(null)}><p className="text-sm leading-6 text-zinc-400">Alle bereits angemeldeten Spieler erhalten sofort eine Benachrichtigung über die neue Uhrzeit.</p><div className="mt-5 grid gap-4"><FormField label="Anmeldung bis"><input type="datetime-local" value={scheduleRegistration} onChange={(event) => setScheduleRegistration(event.target.value)} className={inputClass} /></FormField><FormField label="Turnierstart"><input type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} className={inputClass} /></FormField></div><button type="button" disabled={pending === `schedule:${scheduleFor.id}`} onClick={() => void saveSchedule()} className="mt-6 inline-flex items-center gap-2 bg-teal-300 px-5 py-3 text-xs font-black tracking-[.1em] text-[#09211e] disabled:opacity-60"><CalendarClock size={15} />{pending === `schedule:${scheduleFor.id}` ? 'SPEICHERT …' : 'ZEITPLAN SPEICHERN'}</button></Modal>}
    {cancelFor && <Modal title="Turnier absagen" onClose={() => setCancelFor(null)}><p className="text-sm leading-6 text-zinc-400">Die Absage betrifft nur dein noch nicht gestartetes Turnier. Alle Angemeldeten erhalten eine Benachrichtigung.</p><FormField label="Grund für die Absage" className="mt-5"><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={400} placeholder="z. B. Stream muss heute leider verschoben werden." className={`${inputClass} min-h-24 resize-y`} /></FormField><button type="button" disabled={pending === `cancel:${cancelFor.id}`} onClick={() => void cancelTournament()} className="mt-6 inline-flex items-center gap-2 border border-rose-300/30 bg-rose-300/10 px-5 py-3 text-xs font-black tracking-[.1em] text-rose-100 disabled:opacity-60"><XCircle size={15} />{pending === `cancel:${cancelFor.id}` ? 'SAGT AB …' : 'TURNIER ABSAGEN'}</button></Modal>}
  </main>;
}

const inputClass = 'mt-2 w-full border border-white/12 bg-black/20 px-3.5 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-fuchsia-300/55 focus:bg-black/30';

function FormField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) { return <label className={`block ${className}`}><span className="text-[10px] font-black tracking-[.14em] text-zinc-400">{label.toUpperCase()}</span>{children}</label>; }
function CreatorMetric({ value, label, tone }: { value: string; label: string; tone: 'fuchsia' | 'rose' | 'mint' }) { const colors = { fuchsia: 'text-fuchsia-200', rose: 'text-rose-200', mint: 'text-teal-200' }; return <div className="border-b border-white/10 px-5 py-5 last:border-b-0"><b className={`block text-2xl tracking-[-.05em] ${colors[tone]}`}>{value}</b><span className="mt-1 block text-[9px] font-black tracking-[.14em] text-zinc-500">{label}</span></div>; }
function NoticeBox({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) { const colors = notice.tone === 'success' ? 'border-teal-300/25 bg-teal-300/[.09] text-teal-50' : notice.tone === 'error' ? 'border-rose-300/25 bg-rose-300/[.09] text-rose-100' : 'border-cyan-300/25 bg-cyan-300/[.09] text-cyan-50'; return <div aria-live="polite" className={`flex items-start justify-between gap-4 border px-5 py-4 text-sm ${colors}`}><span>{notice.text}</span><button type="button" onClick={onDismiss} className="text-lg leading-none opacity-70 hover:opacity-100" aria-label="Hinweis schließen">×</button></div>; }
function PolicyCard({ icon, title, points }: { icon: ReactNode; title: string; points: string[] }) { return <section className="border border-white/10 bg-black/20 p-5"><span className="text-fuchsia-200">{icon}</span><p className="mt-3 text-[10px] font-black tracking-[.17em] text-zinc-400">{title.toUpperCase()}</p><ul className="mt-3 space-y-2 text-sm leading-5 text-zinc-300">{points.map((point) => <li key={point} className="flex gap-2"><span className="text-fuchsia-300">•</span>{point}</li>)}</ul></section>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-lg border border-white/15 bg-[#130e16] p-6 shadow-2xl"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-black">{title}</h2><button type="button" onClick={onClose} className="text-zinc-500 hover:text-white" aria-label="Dialog schließen">×</button></div><div className="mt-5">{children}</div></div></div>; }
function ParticipantStatus({ participant }: { participant: Participant }) { const checkedIn = participant.status === 'checked_in'; const waitlist = participant.status === 'waitlisted'; return <span className={`shrink-0 border px-2.5 py-1 text-[9px] font-black tracking-[.1em] ${checkedIn ? 'border-teal-300/25 bg-teal-300/[.08] text-teal-100' : waitlist ? 'border-violet-300/25 bg-violet-300/[.08] text-violet-100' : 'border-white/10 bg-white/[.035] text-zinc-400'}`}>{checkedIn ? 'CHECK-IN' : waitlist ? `WARTELISTE ${participant.waitlist_position ?? ''}` : 'ANGEMELDET'}</span>; }

function CreatorTournamentRow({ tournament, pending, onParticipants, onAnnounce, onSchedule, onCancel }: { tournament: CreatorTournament; pending: string | null; onParticipants: () => void; onAnnounce: () => void; onSchedule: () => void; onCancel: () => void }) {
  const meta = statusMeta[tournament.status];
  const canManage = tournament.status === 'registration';
  return <article className="p-5 sm:p-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`border px-2.5 py-1 text-[9px] font-black tracking-[.14em] ${meta.className}`}>{meta.label}</span><span className="border border-white/10 bg-white/[.03] px-2.5 py-1 text-[9px] font-black tracking-[.1em] text-zinc-400">{platformLabels[tournament.scoring_platform].toUpperCase()}</span></div><h3 className="mt-3 truncate text-xl font-black tracking-[-.03em]">{tournament.title}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{tournament.description || 'Ohne Beschreibung.'}</p></div><Link href={`/tournaments/${tournament.id}`} className="inline-flex shrink-0 items-center justify-center gap-1.5 border border-white/12 bg-white/[.035] px-4 py-2.5 text-xs font-black text-zinc-100 transition hover:border-fuchsia-300/35 hover:text-white">Turnier öffnen <ChevronRight size={14} /></Link></div><div className="mt-5 grid gap-3 border-y border-white/10 py-4 text-xs text-zinc-400 sm:grid-cols-4"><MiniInfo label="START" value={formatDate(tournament.starts_at)} /><MiniInfo label="CHECK-IN" value={formatDate(tournament.check_in_opens_at)} /><MiniInfo label="FORMAT" value={`${formatLabels[tournament.tournament_format]} · Bo${tournament.best_of}`} /><MiniInfo label="STARTER" value={`${tournament.participant_count}/${tournament.max_players}${tournament.waitlist_count ? ` · +${tournament.waitlist_count}` : ''}`} /></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onParticipants} className="inline-flex items-center gap-2 border border-white/12 px-3 py-2.5 text-[10px] font-black tracking-[.1em] text-zinc-200 hover:border-teal-300/35 hover:text-teal-100"><Users size={14} />TEILNEHMER</button>{tournament.creator_announcement_sent_at ? <span className="inline-flex items-center gap-2 border border-teal-300/20 bg-teal-300/[.07] px-3 py-2.5 text-[10px] font-black tracking-[.1em] text-teal-100"><CheckCircle2 size={14} />DISCORD GESENDET</span> : canManage && <button type="button" disabled={pending === `announce:${tournament.id}`} onClick={onAnnounce} className="inline-flex items-center gap-2 border border-fuchsia-300/25 bg-fuchsia-300/[.08] px-3 py-2.5 text-[10px] font-black tracking-[.1em] text-fuchsia-100 disabled:opacity-50"><Megaphone size={14} />{pending === `announce:${tournament.id}` ? 'SENDET …' : tournament.creator_announcement_error ? 'DISCORD ERNEUT VERSUCHEN' : 'DISCORD ANKÜNDIGEN'}</button>}{canManage && <button type="button" onClick={onSchedule} className="inline-flex items-center gap-2 border border-teal-300/25 bg-teal-300/[.06] px-3 py-2.5 text-[10px] font-black tracking-[.1em] text-teal-100"><CalendarClock size={14} />ZEIT ÄNDERN</button>}{canManage && <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 border border-rose-300/20 px-3 py-2.5 text-[10px] font-black tracking-[.1em] text-rose-200 hover:bg-rose-300/[.08]"><XCircle size={14} />ABSAGEN</button>}</div></article>;
}
function MiniInfo({ label, value }: { label: string; value: string }) { return <div><p className="text-[9px] font-black tracking-[.12em] text-zinc-600">{label}</p><p className="mt-1 leading-5 text-zinc-300">{value}</p></div>; }

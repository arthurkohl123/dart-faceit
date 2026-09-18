'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, BellRing, CheckCircle2, ChevronRight, FolderKanban, Megaphone, Radio, RefreshCw, Send, ShieldCheck, Trophy, UserRoundSearch, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Attention = { kind: string; rank: number; title: string; detail: string; entity_id: string; created_at: string };
type TournamentPulse = { id: string; title: string; status: string; starts_at: string; participants: number; open_matches: number; platform: string };
type StaffMember = { profile_id: string; username: string; role: string; is_admin: boolean; is_moderator: boolean };
type WorkspaceData = {
  metrics: { players_total: number; new_players_7d: number; matches_24h: number; matches_7d: number; premium_active: number; completion_rate_7d: number; avg_completion_minutes_7d: number };
  attention: Attention[];
  tournaments: TournamentPulse[];
  staff: StaffMember[];
};
type GrowthFunnel = {
  window_days: number;
  generated_at: string;
  totals: {
    registered: number;
    profile_ready: number;
    first_queue_joined: number;
    first_match_completed: number;
    profile_ready_rate: number;
    queue_rate: number;
    match_rate: number;
    overall_match_rate: number;
    avg_minutes_to_queue: number;
    avg_minutes_to_match: number;
  };
  drop_off: {
    before_profile_ready: number;
    before_first_queue: number;
    before_first_match: number;
  };
  daily: { day: string; registered: number; profile_ready: number; first_queue_joined: number; first_match_completed: number }[];
};
type Case = { id: string; profile_id: string; username: string; title: string; summary: string; case_type: string; priority: string; status: string; owner_username: string | null; created_at: string; updated_at: string };
type Notice = { id: string; title: string; body: string; tone: 'info' | 'success' | 'warning' | 'event'; href: string | null; is_active: boolean; starts_at: string; expires_at: string | null; created_at: string };
type Player360 = {
  profile: { id: string; username: string; elo: number; games_played: number; wins: number; created_at: string; premium: boolean; banned: boolean; phone_verified: boolean; queue_banned_until: string | null; no_show_strikes: number };
  matches: { id: string; opponent: string; status: string; app: string | null; score: string; completed_at: string | null; created_at: string }[];
  tickets: { id: string; subject: string; status: string; priority: string; created_at: string }[];
  payouts: { id: string; source: string; amount_cents: number; status: string; created_at: string }[];
  cases: { id: string; title: string; type: string; status: string; priority: string; updated_at: string }[];
  fairplay: { disposition: string; note: string | null; created_at: string }[];
};

export type OperationsView = 'inbox' | 'players' | 'competition' | 'communications' | 'team';

const input = 'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/45';
function date(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function Badge({ children, tone = 'zinc' }: { children: React.ReactNode; tone?: 'zinc' | 'emerald' | 'amber' | 'violet' | 'rose' }) {
  const tones = { zinc: 'border-white/10 bg-white/[0.04] text-zinc-300', emerald: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100', amber: 'border-amber-300/20 bg-amber-300/10 text-amber-100', violet: 'border-violet-300/20 bg-violet-400/10 text-violet-100', rose: 'border-rose-300/20 bg-rose-400/10 text-rose-100' };
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${tones[tone]}`}>{children}</span>;
}

export function AdminOperationsWorkspace({ view, onNavigate }: { view: OperationsView; onNavigate: (destination: 'disputes' | 'tickets' | 'payouts' | 'tournaments' | 'flagged') => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [cases, setCases] = useState<Case[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [growthFunnel, setGrowthFunnel] = useState<GrowthFunnel | null>(null);
  const [funnelWindowDays, setFunnelWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerMatches, setPlayerMatches] = useState<{ id: string; username: string; elo: number }[]>([]);
  const [player, setPlayer] = useState<Player360 | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [caseDraft, setCaseDraft] = useState({ profileId: '', title: '', summary: '', type: 'fairplay', priority: 'normal', status: 'open' });
  const [noticeDraft, setNoticeDraft] = useState({ title: '', body: '', tone: 'event', href: '', expiresAt: '' });
  const [broadcast, setBroadcast] = useState({ audience: 'all', title: '', body: '', href: '' });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [workspaceResult, casesResult, noticesResult, funnelResult] = await Promise.all([
      supabase.rpc('admin_get_operations_workspace'),
      supabase.rpc('admin_list_cases', { p_status: null }),
      supabase.rpc('admin_list_site_notices'),
      supabase.rpc('admin_get_growth_funnel', { p_days: funnelWindowDays }),
    ]);
    if (workspaceResult.error || casesResult.error || noticesResult.error || funnelResult.error) {
      setMessage(`Operations-Daten konnten nicht vollständig geladen werden: ${workspaceResult.error?.message || casesResult.error?.message || noticesResult.error?.message || funnelResult.error?.message}`);
    }
    if (workspaceResult.data) setWorkspace(workspaceResult.data as WorkspaceData);
    if (casesResult.data) setCases(casesResult.data as Case[]);
    if (noticesResult.data) setNotices(noticesResult.data as Notice[]);
    if (funnelResult.data) setGrowthFunnel(funnelResult.data as GrowthFunnel);
    setLoading(false);
  }, [funnelWindowDays, supabase]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    const query = playerSearch.trim();
    if (query.length < 2) return;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id, username, elo').ilike('username', `%${query.replaceAll('%', '')}%`).limit(8);
      setPlayerMatches((data || []) as { id: string; username: string; elo: number }[]);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [playerSearch, supabase]);

  const openPlayer = async (profileId: string) => {
    setPlayerLoading(true);
    setPlayer(null);
    const { data, error } = await supabase.rpc('admin_get_player_360', { p_profile_id: profileId });
    setPlayerLoading(false);
    if (error) { setMessage(`Spielerakte konnte nicht geladen werden: ${error.message}`); return; }
    setPlayer(data as Player360);
    setPlayerMatches([]);
    setPlayerSearch('');
  };

  const saveCase = async () => {
    if (!caseDraft.profileId || caseDraft.title.trim().length < 3) { setMessage('Für einen Fall brauchst du einen Spieler und einen aussagekräftigen Titel.'); return; }
    const { error } = await supabase.rpc('admin_upsert_case', { p_case_id: null, p_profile_id: caseDraft.profileId, p_title: caseDraft.title.trim(), p_summary: caseDraft.summary.trim(), p_case_type: caseDraft.type, p_priority: caseDraft.priority, p_status: caseDraft.status, p_owner_profile_id: null });
    if (error) { setMessage(`Fall konnte nicht angelegt werden: ${error.message}`); return; }
    setCaseDraft({ profileId: '', title: '', summary: '', type: 'fairplay', priority: 'normal', status: 'open' });
    setMessage('Interner Fall wurde angelegt und im Audit Trail erfasst.');
    await load();
  };

  const advanceCase = async (item: Case, status: string) => {
    const { error } = await supabase.rpc('admin_upsert_case', { p_case_id: item.id, p_profile_id: null, p_title: item.title, p_summary: item.summary, p_case_type: item.case_type, p_priority: item.priority, p_status: status, p_owner_profile_id: null });
    if (error) { setMessage(`Fall konnte nicht aktualisiert werden: ${error.message}`); return; }
    await load();
  };

  const saveNotice = async () => {
    if (noticeDraft.title.trim().length < 3) { setMessage('Bitte gib der Ankündigung einen Titel.'); return; }
    const { error } = await supabase.rpc('admin_upsert_site_notice', { p_notice_id: null, p_title: noticeDraft.title.trim(), p_body: noticeDraft.body.trim(), p_tone: noticeDraft.tone, p_href: noticeDraft.href.trim() || null, p_is_active: true, p_starts_at: new Date().toISOString(), p_expires_at: noticeDraft.expiresAt ? new Date(noticeDraft.expiresAt).toISOString() : null });
    if (error) { setMessage(`Ankündigung konnte nicht gespeichert werden: ${error.message}`); return; }
    setNoticeDraft({ title: '', body: '', tone: 'event', href: '', expiresAt: '' });
    setMessage('Ankündigung ist aktiv und erscheint als Hinweis auf der Plattform.');
    await load();
  };

  const toggleNotice = async (notice: Notice) => {
    const { error } = await supabase.rpc('admin_upsert_site_notice', { p_notice_id: notice.id, p_title: notice.title, p_body: notice.body, p_tone: notice.tone, p_href: notice.href, p_is_active: !notice.is_active, p_starts_at: notice.starts_at, p_expires_at: notice.expires_at });
    if (error) { setMessage(`Ankündigung konnte nicht aktualisiert werden: ${error.message}`); return; }
    await load();
  };

  const sendBroadcast = async () => {
    if (broadcast.title.trim().length < 3 || broadcast.body.trim().length < 3) { setMessage('Eine Nachricht braucht Titel und Text.'); return; }
    setSending(true);
    const { data, error } = await supabase.rpc('admin_send_broadcast', { p_audience: broadcast.audience, p_title: broadcast.title.trim(), p_body: broadcast.body.trim(), p_href: broadcast.href.trim() || null });
    setSending(false);
    if (error) { setMessage(`Nachricht konnte nicht gesendet werden: ${error.message}`); return; }
    setBroadcast({ audience: 'all', title: '', body: '', href: '' });
    setMessage(`Plattform-Nachricht wurde an ${data ?? 0} Spieler gesendet.`);
  };

  const setRole = async (member: StaffMember, role: string) => {
    const { error } = await supabase.rpc('admin_set_staff_role', { p_profile_id: member.profile_id, p_role: role === 'unassigned' ? null : role });
    if (error) { setMessage(`Rolle konnte nicht aktualisiert werden: ${error.message}`); return; }
    setMessage(`Teamrolle für ${member.username} wurde aktualisiert.`);
    await load();
  };

  const metrics = workspace?.metrics;
  const actionFor = (kind: string) => ({ dispute: 'disputes', ticket: 'tickets', payout: 'payouts', tournament: 'tournaments', case: 'flagged' }[kind] || 'flagged') as 'disputes' | 'tickets' | 'payouts' | 'tournaments' | 'flagged';
  const metricCards: { label: string; value: string | number; icon: LucideIcon; tone: string }[] = [
    { label: 'Neue Spieler · 7 Tage', value: metrics?.new_players_7d ?? 0, icon: UsersRound, tone: 'text-cyan-200' },
    { label: 'Matches · 24 Stunden', value: metrics?.matches_24h ?? 0, icon: Radio, tone: 'text-emerald-200' },
    { label: 'Premium aktiv', value: metrics?.premium_active ?? 0, icon: ShieldCheck, tone: 'text-violet-200' },
    { label: 'Abschlussrate · 7 Tage', value: `${metrics?.completion_rate_7d ?? 0}%`, icon: CheckCircle2, tone: 'text-emerald-200' },
    { label: 'Ø Abschlusszeit', value: `${metrics?.avg_completion_minutes_7d ?? 0} min`, icon: BarChart3, tone: 'text-amber-200' },
    { label: 'Spieler gesamt', value: metrics?.players_total ?? 0, icon: UsersRound, tone: 'text-zinc-100' },
  ];
  const funnelStages = growthFunnel ? [
    { label: 'Registriert', value: growthFunnel.totals.registered, rate: 100, drop: 0, tone: 'text-white' },
    { label: 'Profil bereit', value: growthFunnel.totals.profile_ready, rate: growthFunnel.totals.profile_ready_rate, drop: growthFunnel.drop_off.before_profile_ready, tone: 'text-cyan-100' },
    { label: 'Erste Queue', value: growthFunnel.totals.first_queue_joined, rate: growthFunnel.totals.queue_rate, drop: growthFunnel.drop_off.before_first_queue, tone: 'text-amber-100' },
    { label: 'Erstes Match', value: growthFunnel.totals.first_match_completed, rate: growthFunnel.totals.match_rate, drop: growthFunnel.drop_off.before_first_match, tone: 'text-emerald-100' },
  ] : [];

  return <div className="space-y-6">
    {message && <div className="flex items-start justify-between gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.07] px-5 py-4 text-sm font-semibold text-cyan-50"><span>{message}</span><button onClick={() => setMessage(null)} className="text-cyan-200/60 hover:text-white">×</button></div>}

    <section className={view === 'inbox' ? 'overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.14),transparent_48%),rgba(9,13,19,0.9)] shadow-2xl shadow-black/25' : 'hidden'}>
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 p-6"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">Operations inbox</p><h3 className="mt-2 text-3xl font-black tracking-[-0.05em] text-white">Was braucht jetzt Aufmerksamkeit?</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Alle priorisierten Vorgänge aus Matchsystem, Support, Auszahlungen, Turnieren und internen Fällen — ohne manuelles Suchen.</p></div><button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black text-zinc-100 transition hover:bg-white/[0.09] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Synchronisieren</button></div>
      <div className="grid gap-px bg-white/10 md:grid-cols-3">{metricCards.map((card) => { const Icon = card.icon; return <div key={card.label} className="bg-[#0a0e14] p-5"><Icon className={`h-4 w-4 ${card.tone}`} /><p className="mt-5 text-3xl font-black tracking-[-0.05em] text-white">{card.value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{card.label}</p></div>; })}</div>
      <div className="p-4 sm:p-6">{loading ? <p className="py-8 text-sm text-zinc-500">Lade Operations-Daten …</p> : (workspace?.attention.length ?? 0) === 0 ? <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.06] px-4 py-5 text-sm text-emerald-100"><CheckCircle2 className="h-5 w-5" /> Keine offenen Vorgänge in der Operations-Inbox.</div> : <div className="grid gap-3 lg:grid-cols-2">{workspace?.attention.slice(0, 12).map((item) => <button key={`${item.kind}-${item.entity_id}`} onClick={() => onNavigate(actionFor(item.kind))} className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-cyan-300/25 hover:bg-cyan-400/[0.06]"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${item.rank >= 4 ? 'border-rose-300/25 bg-rose-400/10 text-rose-200' : item.rank >= 3 ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100'}`}><AlertTriangle className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-white">{item.title}</span><span className="mt-1 block truncate text-xs text-zinc-500">{item.detail}</span></span><ChevronRight className="h-4 w-4 text-zinc-600 transition group-hover:text-cyan-200" /></button>)}</div>}</div>
    </section>

    <div className={view === 'players' ? 'grid gap-6 xl:grid-cols-[1.15fr_0.85fr]' : 'hidden'}>
      <section className="rounded-[2rem] border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/25 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-100"><UserRoundSearch className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">Spieler 360°</p><h3 className="mt-1 text-xl font-black text-white">Ein Profil, der ganze Verlauf</h3></div></div><div className="relative mt-5"><input value={playerSearch} onChange={(event) => { setPlayerSearch(event.target.value); if (event.target.value.trim().length < 2) setPlayerMatches([]); }} className={input} placeholder="Spielername suchen …" />{playerMatches.length > 0 && <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#111720] shadow-2xl">{playerMatches.map((candidate) => <button key={candidate.id} onClick={() => void openPlayer(candidate.id)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-white/[0.06]"><span className="font-bold text-white">{candidate.username}</span><span className="text-xs text-emerald-200">{candidate.elo} Elo</span></button>)}</div>}</div>{playerLoading && <p className="mt-5 text-sm text-zinc-500">Lade Prüfakte …</p>}{player && <div className="mt-5 space-y-4"><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-lg font-black text-white">{player.profile.username}</h4><p className="mt-1 text-xs text-zinc-500">Erstellt {date(player.profile.created_at)} · Telefon {player.profile.phone_verified ? 'bestätigt' : 'nicht bestätigt'}</p></div><div className="flex flex-wrap gap-2"><Badge tone="emerald">{player.profile.elo} Elo</Badge>{player.profile.premium && <Badge tone="violet">Premium</Badge>}{player.profile.banned && <Badge tone="rose">Gesperrt</Badge>}</div></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-black">{player.profile.games_played}</p><p className="text-[9px] uppercase tracking-wider text-zinc-500">Games</p></div><div><p className="text-lg font-black">{player.profile.wins}</p><p className="text-[9px] uppercase tracking-wider text-zinc-500">Siege</p></div><div><p className="text-lg font-black">{player.profile.no_show_strikes}</p><p className="text-[9px] uppercase tracking-wider text-zinc-500">No-Shows</p></div></div></div><div className="grid gap-3 md:grid-cols-2"><MiniList title="Letzte Matches" items={player.matches.slice(0, 6).map((m) => `${m.opponent} · ${m.score} · ${m.app || '—'}`)} /><MiniList title="Tickets" items={player.tickets.map((t) => `${t.subject} · ${t.status}`)} /><MiniList title="Auszahlungen" items={player.payouts.map((p) => `${p.source} · ${(p.amount_cents / 100).toFixed(2)} € · ${p.status}`)} /><MiniList title="Interne Fälle" items={player.cases.map((c) => `${c.title} · ${c.status}`)} /></div><button onClick={() => setCaseDraft((draft) => ({ ...draft, profileId: player.profile.id, title: draft.title || `Prüfung: ${player.profile.username}` }))} className="rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 py-2.5 text-xs font-black text-violet-100">Fall für diesen Spieler anlegen</button></div>}</section>

      <section className="rounded-[2rem] border border-amber-300/15 bg-amber-300/[0.035] p-5 shadow-2xl shadow-black/25 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-100"><FolderKanban className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">Fallmanagement</p><h3 className="mt-1 text-xl font-black text-white">Saubere interne Vorgänge</h3></div></div><div className="mt-5 space-y-3"><input value={caseDraft.title} onChange={(e) => setCaseDraft({ ...caseDraft, title: e.target.value })} className={input} placeholder="Titel des Falls" /><textarea value={caseDraft.summary} onChange={(e) => setCaseDraft({ ...caseDraft, summary: e.target.value })} className={`${input} min-h-20 resize-y`} placeholder="Interne Zusammenfassung / Belege …" /><div className="grid grid-cols-3 gap-2"><select value={caseDraft.type} onChange={(e) => setCaseDraft({ ...caseDraft, type: e.target.value })} className={input}><option value="fairplay">Fair Play</option><option value="match">Match</option><option value="support">Support</option><option value="tournament">Turnier</option><option value="account">Account</option></select><select value={caseDraft.priority} onChange={(e) => setCaseDraft({ ...caseDraft, priority: e.target.value })} className={input}><option value="low">Niedrig</option><option value="normal">Normal</option><option value="high">Hoch</option><option value="urgent">Dringend</option></select><button onClick={() => void saveCase()} className="rounded-xl bg-amber-300 px-3 text-xs font-black text-black transition hover:bg-amber-200">Anlegen</button></div></div><div className="mt-6 space-y-2">{cases.slice(0, 6).map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white">{item.title}</p><p className="mt-1 text-xs text-zinc-500">{item.username} · aktualisiert {date(item.updated_at)}</p></div><Badge tone={item.priority === 'urgent' ? 'rose' : item.priority === 'high' ? 'amber' : 'zinc'}>{item.status}</Badge></div><div className="mt-3 flex gap-2"><button onClick={() => void advanceCase(item, 'investigating')} className="text-[10px] font-black uppercase tracking-wider text-cyan-200 hover:text-white">Übernehmen</button><button onClick={() => void advanceCase(item, 'resolved')} className="text-[10px] font-black uppercase tracking-wider text-emerald-200 hover:text-white">Lösen</button></div></div>)}{cases.length === 0 && <p className="py-5 text-sm text-zinc-500">Noch keine internen Fälle.</p>}</div></section>
    </div>

    <div className={view === 'competition' || view === 'communications' ? 'grid gap-6 xl:grid-cols-2' : 'hidden'}>
      <section className={view === 'competition' ? 'rounded-[2rem] border border-cyan-300/15 bg-cyan-400/[0.035] p-5 shadow-2xl shadow-black/25 sm:p-6' : 'hidden'}><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"><Trophy className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Turnier-Leitstand</p><h3 className="mt-1 text-xl font-black text-white">Laufende Cups auf einen Blick</h3></div></div><div className="mt-5 space-y-3">{workspace?.tournaments.length ? workspace.tournaments.map((tournament) => <button key={tournament.id} onClick={() => onNavigate('tournaments')} className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:border-cyan-300/25"><span><span className="block text-sm font-black text-white">{tournament.title}</span><span className="mt-1 block text-xs text-zinc-500">{tournament.participants} Teilnehmer · {tournament.open_matches} offene Paarungen · {tournament.platform}</span></span><Badge tone={tournament.status === 'live' ? 'emerald' : 'violet'}>{tournament.status === 'live' ? 'Live' : 'Anmeldung'}</Badge></button>) : <p className="py-5 text-sm text-zinc-500">Derzeit kein aktives Turnier.</p>}</div><button onClick={() => onNavigate('tournaments')} className="mt-5 text-xs font-black text-cyan-200 hover:text-white">Turnierverwaltung öffnen →</button></section>

      <section className={view === 'communications' ? 'rounded-[2rem] border border-violet-300/15 bg-violet-400/[0.035] p-5 shadow-2xl shadow-black/25 sm:p-6' : 'hidden'}><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-100"><Megaphone className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-200">Plattform-Ankündigung</p><h3 className="mt-1 text-xl font-black text-white">Banner mit Ablaufzeit</h3></div></div><div className="mt-5 grid gap-3"><input value={noticeDraft.title} onChange={(e) => setNoticeDraft({ ...noticeDraft, title: e.target.value })} className={input} placeholder="z. B. Mittwoch Showdown heute" /><textarea value={noticeDraft.body} onChange={(e) => setNoticeDraft({ ...noticeDraft, body: e.target.value })} className={`${input} min-h-16 resize-y`} placeholder="Kurzer Hinweis für Spieler …" /><div className="grid grid-cols-3 gap-2"><select value={noticeDraft.tone} onChange={(e) => setNoticeDraft({ ...noticeDraft, tone: e.target.value })} className={input}><option value="event">Event</option><option value="info">Info</option><option value="success">Erfolg</option><option value="warning">Hinweis</option></select><input value={noticeDraft.href} onChange={(e) => setNoticeDraft({ ...noticeDraft, href: e.target.value })} className={input} placeholder="/showdown" /><input type="datetime-local" value={noticeDraft.expiresAt} onChange={(e) => setNoticeDraft({ ...noticeDraft, expiresAt: e.target.value })} className={input} /></div><button onClick={() => void saveNotice()} className="rounded-xl bg-violet-300 px-4 py-3 text-xs font-black text-violet-950 transition hover:bg-violet-200">Ankündigung aktivieren</button></div><div className="mt-5 space-y-2">{notices.slice(0, 4).map((notice) => <div key={notice.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{notice.title}</span><span className="text-xs text-zinc-500">{notice.is_active ? 'aktiv' : 'pausiert'} · bis {date(notice.expires_at)}</span></span><button onClick={() => void toggleNotice(notice)} className="text-[10px] font-black uppercase tracking-wider text-violet-200 hover:text-white">{notice.is_active ? 'Pausieren' : 'Aktivieren'}</button></div>)}</div></section>
    </div>

    <div className={view === 'communications' || view === 'team' ? 'grid gap-6 xl:grid-cols-[1fr_1fr]' : 'hidden'}>
      <section className={view === 'communications' ? 'rounded-[2rem] border border-emerald-300/15 bg-emerald-400/[0.035] p-5 shadow-2xl shadow-black/25 sm:p-6' : 'hidden'}><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-100"><BellRing className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Kommunikationscenter</p><h3 className="mt-1 text-xl font-black text-white">Gezielte In-App-Nachricht</h3></div></div><div className="mt-5 space-y-3"><select value={broadcast.audience} onChange={(e) => setBroadcast({ ...broadcast, audience: e.target.value })} className={input}><option value="all">Alle nicht gesperrten Spieler</option><option value="premium">Nur Premium-Spieler</option><option value="active_30d">Aktive Spieler · letzte 30 Tage</option></select><input value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} className={input} placeholder="Titel" /><textarea value={broadcast.body} onChange={(e) => setBroadcast({ ...broadcast, body: e.target.value })} className={`${input} min-h-20 resize-y`} placeholder="Nachricht …" /><input value={broadcast.href} onChange={(e) => setBroadcast({ ...broadcast, href: e.target.value })} className={input} placeholder="Optionaler interner Link, z. B. /tournaments" /><button onClick={() => void sendBroadcast()} disabled={sending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-black transition hover:bg-emerald-200 disabled:opacity-50"><Send className="h-3.5 w-3.5" />{sending ? 'Sendet …' : 'Nachricht senden'}</button></div><p className="mt-3 text-[11px] leading-5 text-zinc-500">Der Versand wird im Audit Trail protokolliert. Keine E-Mail, keine externe Nachricht — nur die Plattform-Glocke.</p></section>

      <section className={view === 'team' ? 'rounded-[2rem] border border-white/10 bg-zinc-950/75 p-5 shadow-2xl shadow-black/25 sm:p-6' : 'hidden'}><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-100"><UsersRound className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Team & Berechtigungen</p><h3 className="mt-1 text-xl font-black text-white">Klare Verantwortlichkeiten</h3></div></div><div className="mt-5 grid grid-cols-2 gap-2">{metricCards.slice(0, 4).map((card) => <div key={card.label} className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-lg font-black text-white">{card.value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">{card.label}</p></div>)}</div><div className="mt-5 space-y-2">{workspace?.staff.map((member) => <div key={member.profile_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3"><div><p className="text-sm font-black text-white">{member.username}</p><p className="mt-0.5 text-xs text-zinc-500">{member.is_admin ? 'Voller Systemzugriff' : member.is_moderator ? 'Moderationskonto' : 'Teamkonto'}</p></div><select value={member.role} onChange={(e) => void setRole(member, e.target.value)} disabled={member.is_admin} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs font-bold text-zinc-200 disabled:opacity-60"><option value="unassigned">Nicht zugeordnet</option><option value="support">Support</option><option value="moderator">Moderation</option><option value="tournament_manager">Turnierleitung</option><option value="finance">Finanzen</option><option value="admin">Admin</option></select></div>)}</div><p className="mt-4 text-[11px] leading-5 text-zinc-500">Neue Rollen steuern die Operations-Funktionen. Bestehende Admin-Rechte bleiben unverändert, damit keine aktuelle Berechtigung ungewollt verloren geht.</p></section>
    </div>

    <section className={view === 'team' ? 'overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.12),transparent_44%),#0a0e14] shadow-2xl shadow-black/25' : 'hidden'}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"><BarChart3 className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Wachstums-Funnel</p><h3 className="mt-1 text-xl font-black text-white">Wo neue Spieler abspringen</h3><p className="mt-1 text-sm text-zinc-400">Von der Registrierung bis zum ersten gewerteten Queue-Match.</p></div></div>
        <div className="flex items-center gap-2"><select value={funnelWindowDays} onChange={(event) => setFunnelWindowDays(Number(event.target.value))} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-zinc-200"><option value={7}>Letzte 7 Tage</option><option value={30}>Letzte 30 Tage</option><option value={60}>Letzte 60 Tage</option><option value={90}>Letzte 90 Tage</option></select><button onClick={() => void load()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50" aria-label="Funnel aktualisieren"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button></div>
      </div>
      {growthFunnel ? <div className="p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-4">{funnelStages.map((stage, index) => <div key={stage.label} className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4"><div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300/70 via-emerald-300/55 to-transparent" /><p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{String(index + 1).padStart(2, '0')} · {stage.label}</p><p className={`mt-4 text-4xl font-black tracking-[-0.06em] ${stage.tone}`}>{stage.value}</p>{index > 0 ? <><p className="mt-1 text-xs font-bold text-zinc-400">{stage.rate}% vom vorherigen Schritt</p><p className={`mt-3 text-[11px] font-semibold ${stage.drop > 0 ? 'text-amber-200' : 'text-emerald-200'}`}>{stage.drop > 0 ? `−${stage.drop} vor diesem Schritt` : 'Kein Verlust in diesem Schritt'}</p></> : <p className="mt-1 text-xs font-bold text-zinc-400">Ausgangskohorte</p>}</div>)}</div>
        <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Gesamt bis erstes Match</p><p className="mt-2 text-2xl font-black text-emerald-200">{growthFunnel.totals.overall_match_rate}%</p><p className="mt-1 text-xs text-zinc-500">aller Registrierungen im Zeitraum</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Ø bis erste Queue</p><p className="mt-2 text-2xl font-black text-cyan-100">{growthFunnel.totals.avg_minutes_to_queue || '—'}{growthFunnel.totals.avg_minutes_to_queue ? ' min' : ''}</p><p className="mt-1 text-xs text-zinc-500">ab Profil-Erstellung</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Ø bis erstes Match</p><p className="mt-2 text-2xl font-black text-violet-100">{growthFunnel.totals.avg_minutes_to_match || '—'}{growthFunnel.totals.avg_minutes_to_match ? ' min' : ''}</p><p className="mt-1 text-xs text-zinc-500">ab Profil-Erstellung</p></div></div>
        <p className="mt-5 text-[11px] leading-5 text-zinc-500">Datensparsam: Erfasst werden nur die ersten Queue- und Match-Zeitpunkte eines Kontos. Keine IP-Adressen, Gerätekennungen, E-Mail-Adressen oder Seitenaufrufe. Historische erfolgreiche Queue-Einstiege wurden aus bereits abgeschlossenen Ranked-Queue-Matches rekonstruiert; neue Queue-Einstiege werden ab dieser Migration vollständig erfasst.</p>
      </div> : <p className="p-6 text-sm text-zinc-500">Funnel-Daten werden geladen …</p>}
    </section>
  </div>;
}

function MiniList({ title, items }: { title: string; items: string[] }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">{title}</p><div className="mt-2 space-y-1.5">{items.length ? items.map((item, index) => <p key={`${item}-${index}`} className="truncate text-xs text-zinc-300">{item}</p>) : <p className="text-xs text-zinc-600">Keine Einträge.</p>}</div></div>;
}

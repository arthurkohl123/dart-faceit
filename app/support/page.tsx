'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Bug,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gavel,
  Headphones,
  HelpCircle,
  Menu,
  MessageCircle,
  Plus,
  Send,
  Shield,
  Sparkles,
  User,
  X,
  XCircle,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed';
type TicketCategory = 'general' | 'bug' | 'account' | 'match_dispute' | 'ban_appeal' | 'other';

type Ticket = {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: string;
  created_at: string;
  updated_at: string;
  message_count: number;
};

type TicketMessage = {
  id: string;
  sender_name: string;
  is_staff: boolean;
  content: string;
  created_at: string;
};

type TicketDetail = {
  ticket: Ticket & { admin_note: string | null };
  messages: TicketMessage[];
};

// ─── Config ───────────────────────────────────────────────────────────────────

const statusConfig: Record<TicketStatus, { label: string; color: string; dot: string; bg: string }> = {
  open:             { label: 'Offen',           color: 'text-emerald-200', dot: 'bg-emerald-300', bg: 'border-emerald-300/20 bg-emerald-400/10' },
  in_progress:      { label: 'In Bearbeitung',  color: 'text-cyan-200',    dot: 'bg-cyan-300',    bg: 'border-cyan-300/20 bg-cyan-400/10' },
  waiting_for_user: { label: 'Warte auf dich',  color: 'text-amber-200',   dot: 'bg-amber-300',   bg: 'border-amber-300/20 bg-amber-400/10' },
  resolved:         { label: 'Gelöst',          color: 'text-zinc-300',    dot: 'bg-zinc-400',    bg: 'border-zinc-400/20 bg-zinc-400/10' },
  closed:           { label: 'Geschlossen',     color: 'text-zinc-500',    dot: 'bg-zinc-600',    bg: 'border-zinc-700/20 bg-zinc-800/10' },
};

const categoryConfig: Record<TicketCategory, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  general:       { label: 'Allgemein',    icon: <HelpCircle size={20} />,   color: 'border-zinc-300/20 bg-zinc-400/10 text-zinc-200',    desc: 'Allgemeine Fragen & Feedback' },
  bug:           { label: 'Bug / Fehler', icon: <Bug size={20} />,          color: 'border-red-300/20 bg-red-400/10 text-red-200',        desc: 'Technische Probleme melden' },
  account:       { label: 'Account',     icon: <User size={20} />,          color: 'border-blue-300/20 bg-blue-400/10 text-blue-200',     desc: 'Login, Profil, Einstellungen' },
  match_dispute: { label: 'Match-Streit',icon: <Gavel size={20} />,         color: 'border-amber-300/20 bg-amber-400/10 text-amber-200',  desc: 'Probleme mit einem Match' },
  ban_appeal:    { label: 'Ban-Einspruch',icon: <Shield size={20} />,       color: 'border-violet-300/20 bg-violet-400/10 text-violet-200',desc: 'Einspruch gegen eine Sperre' },
  other:         { label: 'Sonstiges',   icon: <Sparkles size={20} />,      color: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200', desc: 'Alles andere' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days !== 1 ? 'en' : ''}`;
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
          <div>
            <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Support Center</div>
          </div>
        </Link>
        <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
          <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
          <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
          <Link href="/profile" className="transition hover:text-white">Profil</Link>
          <Link href="/history" className="transition hover:text-white">History</Link>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="hidden rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10 sm:block">Logout</button>
          <button onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
          <div className="flex flex-col gap-1">
            {[['Matchmaking', '/matchmaking'], ['Leaderboard', '/leaderboard'], ['Profil', '/profile'], ['History', '/history']].map(([label, href]) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">{label}</Link>
            ))}
            <div className="mt-2 border-t border-white/10 pt-2">
              <button onClick={onLogout} className="w-full rounded-2xl px-4 py-3 text-left text-sm font-bold text-zinc-400 transition hover:bg-white/10 hover:text-white">Logout</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Neues Ticket
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [message, setMessage] = useState('');

  // Antwort
  const [replyText, setReplyText] = useState('');

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/auth/login');
    });
  }, [supabase, router]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_my_tickets');
    if (data) setTickets(data as Ticket[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void loadTickets(); }, [loadTickets]);

  const openDetail = async (ticketId: string) => {
    setError('');
    const { data, error: err } = await supabase.rpc('get_ticket_detail', { p_ticket_id: ticketId });
    if (err) { setError(err.message); return; }
    setDetail(data as TicketDetail);
    setView('detail');
  };

  const submitNewTicket = async () => {
    if (!subject.trim() || !message.trim()) { setError('Bitte Betreff und Nachricht ausfüllen.'); return; }
    setSending(true); setError('');
    const { error: err } = await supabase.rpc('create_ticket', {
      p_subject:  subject.trim(),
      p_category: category,
      p_message:  message.trim(),
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    setSuccess('Ticket wurde erstellt! Wir melden uns so schnell wie möglich.');
    setSubject(''); setCategory('general'); setMessage('');
    await loadTickets();
    setTimeout(() => { setSuccess(''); setView('list'); }, 2500);
  };

  const sendReply = async () => {
    if (!replyText.trim() || !detail) return;
    setSending(true); setError('');
    const { error: err } = await supabase.rpc('send_ticket_message', {
      p_ticket_id: detail.ticket.id,
      p_content:   replyText.trim(),
    });
    setSending(false);
    if (err) { setError(err.message); return; }
    setReplyText('');
    await openDetail(detail.ticket.id);
  };

  const openCount  = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const waitCount  = tickets.filter(t => t.status === 'waiting_for_user').length;
  const doneCount  = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">

      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.18),transparent_40%),radial-gradient(ellipse_at_80%_5%,rgba(34,197,94,0.10),transparent_30%),radial-gradient(ellipse_at_50%_80%,rgba(6,182,212,0.07),transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.055] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
      </div>

      <Navbar onLogout={logout} />

      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* ═══════════════════════════════════════════════════════════════════
            TICKET-LISTE
        ═══════════════════════════════════════════════════════════════════ */}
        {view === 'list' && (
          <>
            {/* Hero */}
            <div className="mb-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-violet-200">
                <Headphones size={13} /> Support Center
              </div>
              <h1 className="mt-4 text-5xl font-black tracking-[-0.06em] sm:text-6xl">
                Wie können wir<br />
                <span className="bg-gradient-to-r from-violet-300 via-emerald-200 to-cyan-300 bg-clip-text text-transparent">dir helfen?</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-8 text-zinc-400">
                Erstelle ein Support-Ticket und unser Team meldet sich so schnell wie möglich bei dir. Durchschnittliche Antwortzeit: unter 24 Stunden.
              </p>
            </div>

            {/* Stats-Karten */}
            <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-xl">
                <div className="absolute right-4 top-4 h-8 w-8 rounded-full bg-emerald-400/10 flex items-center justify-center">
                  <MessageCircle size={14} className="text-emerald-300" />
                </div>
                <div className="text-3xl font-black tracking-[-0.05em] text-emerald-300">{openCount}</div>
                <div className="mt-1 text-xs font-bold text-zinc-500">Aktive Tickets</div>
              </div>
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-xl">
                <div className="absolute right-4 top-4 h-8 w-8 rounded-full bg-amber-400/10 flex items-center justify-center">
                  <Clock size={14} className="text-amber-300" />
                </div>
                <div className="text-3xl font-black tracking-[-0.05em] text-amber-300">{waitCount}</div>
                <div className="mt-1 text-xs font-bold text-zinc-500">Warte auf dich</div>
              </div>
              <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-xl">
                <div className="absolute right-4 top-4 h-8 w-8 rounded-full bg-zinc-400/10 flex items-center justify-center">
                  <CheckCircle2 size={14} className="text-zinc-400" />
                </div>
                <div className="text-3xl font-black tracking-[-0.05em] text-zinc-300">{doneCount}</div>
                <div className="mt-1 text-xs font-bold text-zinc-500">Gelöst</div>
              </div>
            </div>

            {/* Neues Ticket CTA */}
            <button
              onClick={() => { setView('new'); setError(''); setSuccess(''); }}
              className="group mb-8 flex w-full items-center justify-between overflow-hidden rounded-[2rem] border border-violet-400/25 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent p-6 text-left transition hover:border-violet-400/40 hover:from-violet-500/15 sm:p-7"
            >
              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-violet-300 mb-2">Neues Ticket</div>
                <div className="text-xl font-black text-white sm:text-2xl">Problem melden oder Frage stellen</div>
                <div className="mt-1 text-sm text-zinc-500">Wähle eine Kategorie und beschreibe dein Anliegen</div>
              </div>
              <div className="ml-4 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-300 text-black shadow-[0_8px_30px_rgba(139,92,246,0.3)] transition group-hover:scale-105">
                <Plus size={22} />
              </div>
            </button>

            {error && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
                <XCircle size={18} className="shrink-0" /> {error}
              </div>
            )}

            {/* Ticket-Liste */}
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-24">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-violet-400" />
                <p className="text-sm font-bold text-zinc-600">Tickets werden geladen…</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-5 rounded-[2.5rem] border border-white/10 bg-zinc-950/60 py-24 text-center backdrop-blur-xl">
                <div className="grid h-20 w-20 place-items-center rounded-[1.75rem] border border-violet-400/20 bg-violet-400/10">
                  <Headphones className="h-9 w-9 text-violet-400" />
                </div>
                <div>
                  <p className="text-xl font-black text-zinc-400">Noch keine Tickets</p>
                  <p className="mt-2 text-sm text-zinc-600 max-w-xs mx-auto">Du hast noch keine Support-Anfragen gestellt. Erstelle dein erstes Ticket wenn du Hilfe benötigst.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-zinc-600">Deine Tickets ({tickets.length})</div>
                {tickets.map((t) => {
                  const sc = statusConfig[t.status];
                  const cc = categoryConfig[t.category];
                  return (
                    <button
                      key={t.id}
                      onClick={() => void openDetail(t.id)}
                      className="group relative w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-5 text-left backdrop-blur-xl transition hover:border-white/20 hover:bg-zinc-900/70 sm:p-6"
                    >
                      {/* Linker farbiger Streifen */}
                      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${sc.dot}`} />

                      <div className="flex items-start justify-between gap-4 pl-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2.5">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${sc.bg} ${sc.color}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                              {sc.label}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${cc.color}`}>
                              {cc.label}
                            </span>
                          </div>
                          <p className="truncate text-base font-black text-white">{t.subject}</p>
                          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-600">
                            <span className="flex items-center gap-1"><MessageCircle size={11} /> {t.message_count} Nachricht{t.message_count !== 1 ? 'en' : ''}</span>
                            <span>·</span>
                            <span>{timeAgo(t.updated_at)}</span>
                          </div>
                        </div>
                        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-zinc-700 transition group-hover:text-zinc-400 group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            NEUES TICKET
        ═══════════════════════════════════════════════════════════════════ */}
        {view === 'new' && (
          <>
            <button onClick={() => setView('list')} className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white">
              <ArrowLeft size={16} /> Zurück
            </button>

            {/* Header */}
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-violet-200">
                <Plus size={12} /> Neues Ticket
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Ticket erstellen</h2>
              <p className="mt-3 text-zinc-500">Wähle eine Kategorie und beschreibe dein Anliegen so detailliert wie möglich.</p>
            </div>

            {error && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
                <AlertCircle size={16} className="shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-5 text-sm font-semibold text-emerald-100">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-300" />
                <div>
                  <div className="font-black text-base text-emerald-200">Ticket eingereicht!</div>
                  <div className="mt-0.5 text-emerald-300/80">{success}</div>
                </div>
              </div>
            )}

            <div className="space-y-6">

              {/* Schritt 1: Kategorie */}
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                <div className="border-b border-white/10 px-6 py-5 flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-400/15 text-violet-300 text-sm font-black">1</div>
                  <div>
                    <div className="text-sm font-black text-white">Kategorie wählen</div>
                    <div className="text-xs text-zinc-600">Worum geht es bei deinem Anliegen?</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
                  {(Object.entries(categoryConfig) as [TicketCategory, typeof categoryConfig[TicketCategory]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition ${
                        category === key
                          ? `${cfg.color} shadow-[0_0_20px_rgba(139,92,246,0.1)]`
                          : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                      }`}
                    >
                      {category === key && (
                        <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-current opacity-70" />
                      )}
                      <div className={category === key ? '' : 'text-zinc-600'}>{cfg.icon}</div>
                      <div>
                        <div className="text-sm font-black">{cfg.label}</div>
                        <div className={`mt-0.5 text-[11px] leading-4 ${category === key ? 'opacity-70' : 'text-zinc-700'}`}>{cfg.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Schritt 2: Betreff */}
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                <div className="border-b border-white/10 px-6 py-5 flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-400/15 text-violet-300 text-sm font-black">2</div>
                  <div>
                    <div className="text-sm font-black text-white">Betreff</div>
                    <div className="text-xs text-zinc-600">Kurze Zusammenfassung deines Problems</div>
                  </div>
                </div>
                <div className="p-5">
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="z.B. Kann mich nicht einloggen / Match wurde falsch gewertet"
                    maxLength={120}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
                  />
                  <div className="mt-2 flex justify-end text-xs text-zinc-700">{subject.length}/120</div>
                </div>
              </div>

              {/* Schritt 3: Nachricht */}
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                <div className="border-b border-white/10 px-6 py-5 flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-400/15 text-violet-300 text-sm font-black">3</div>
                  <div>
                    <div className="text-sm font-black text-white">Beschreibung</div>
                    <div className="text-xs text-zinc-600">Je mehr Details, desto schneller können wir helfen</div>
                  </div>
                </div>
                <div className="p-5">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Beschreibe dein Problem so genau wie möglich.\n\nNützliche Informationen:\n• Wann ist das Problem aufgetreten?\n• Was hast du versucht?\n• Fehlermeldungen oder Screenshots?`}
                    rows={7}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
                  />
                  <div className="mt-2 flex justify-end text-xs text-zinc-700">{message.length} Zeichen</div>
                </div>
              </div>

              {/* Absenden */}
              <button
                onClick={() => void submitNewTicket()}
                disabled={sending || !subject.trim() || !message.trim()}
                className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-r from-violet-500 via-purple-400 to-violet-500 py-5 font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_50px_rgba(139,92,246,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {sending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Wird gesendet…
                    </>
                  ) : (
                    <>
                      <Send size={17} />
                      Ticket einreichen
                    </>
                  )}
                </span>
              </button>

              {/* Hinweis */}
              <div className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-xs text-zinc-600">
                <Zap size={14} className="mt-0.5 shrink-0 text-zinc-700" />
                <span>Unser Support-Team antwortet in der Regel innerhalb von 24 Stunden. Du erhältst eine Antwort direkt in diesem Ticket.</span>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TICKET-DETAIL
        ═══════════════════════════════════════════════════════════════════ */}
        {view === 'detail' && detail && (
          <>
            <button onClick={() => { setView('list'); setDetail(null); }} className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white">
              <ArrowLeft size={16} /> Zurück zu meinen Tickets
            </button>

            {/* Ticket-Info-Banner */}
            <div className="mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
              <div className="bg-gradient-to-r from-violet-500/10 via-transparent to-transparent px-6 py-6 sm:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {(() => {
                        const sc = statusConfig[detail.ticket.status];
                        return (
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] ${sc.bg} ${sc.color}`}>
                            <span className={`h-2 w-2 rounded-full ${sc.dot} ${detail.ticket.status === 'open' || detail.ticket.status === 'in_progress' ? 'animate-pulse' : ''}`} />
                            {sc.label}
                          </span>
                        );
                      })()}
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${categoryConfig[detail.ticket.category].color}`}>
                        {categoryConfig[detail.ticket.category].icon}
                        {categoryConfig[detail.ticket.category].label}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black tracking-[-0.04em] sm:text-3xl">{detail.ticket.subject}</h2>
                    <p className="mt-2 text-xs text-zinc-600">Erstellt am {formatDate(detail.ticket.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <MessageCircle size={15} className="text-zinc-500" />
                    <span className="text-sm font-black text-zinc-300">{detail.messages.length}</span>
                    <span className="text-xs text-zinc-600">Nachrichten</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nachrichten-Thread */}
            <div className="mb-5 space-y-4">
              {detail.messages.map((msg, i) => (
                <div
                  key={msg.id}
                  className={`flex gap-4 ${msg.is_staff ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-black ${
                    msg.is_staff
                      ? 'border border-emerald-300/25 bg-emerald-400/15 text-emerald-200'
                      : 'border border-white/10 bg-white/[0.06] text-zinc-300'
                  }`}>
                    {msg.is_staff ? 'RD' : msg.sender_name.charAt(0).toUpperCase()}
                  </div>

                  {/* Bubble */}
                  <div className={`max-w-[80%] overflow-hidden rounded-[1.5rem] ${
                    msg.is_staff
                      ? 'rounded-tr-md border border-emerald-300/20 bg-gradient-to-br from-emerald-400/10 to-emerald-400/5'
                      : 'rounded-tl-md border border-white/10 bg-zinc-900/80'
                  }`}>
                    <div className={`flex items-center gap-2 border-b px-5 py-3 ${msg.is_staff ? 'border-emerald-300/15' : 'border-white/[0.06]'}`}>
                      <span className={`text-xs font-black ${msg.is_staff ? 'text-emerald-300' : 'text-white'}`}>{msg.sender_name}</span>
                      {msg.is_staff && (
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">Support</span>
                      )}
                      <span className="ml-auto text-[10px] text-zinc-600">{timeAgo(msg.created_at)}</span>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-sm leading-7 text-zinc-300 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Antwort-Box */}
            {!['resolved', 'closed'].includes(detail.ticket.status) ? (
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                <div className="border-b border-white/10 px-6 py-4">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Antworten</div>
                </div>
                <div className="p-5">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Schreibe deine Antwort…"
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/40 focus:bg-white/[0.07]"
                  />
                  {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-zinc-700">{replyText.length} Zeichen</span>
                    <button
                      onClick={() => void sendReply()}
                      disabled={sending || !replyText.trim()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-400 px-6 py-3 text-sm font-black text-white shadow-[0_8px_25px_rgba(139,92,246,0.2)] transition hover:-translate-y-0.5 disabled:opacity-40"
                    >
                      <Send size={15} />
                      {sending ? 'Senden…' : 'Antworten'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-5 text-sm text-zinc-500">
                <CheckCircle2 size={16} className="shrink-0 text-zinc-600" />
                <span>Dieses Ticket ist geschlossen. Erstelle ein <button onClick={() => setView('new')} className="font-bold text-zinc-400 underline underline-offset-2 hover:text-white transition">neues Ticket</button> falls du weitere Hilfe benötigst.</span>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

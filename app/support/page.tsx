'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  Headphones,
  Menu,
  MessageCircle,
  Plus,
  Send,
  X,
  XCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus = 'open' | 'in_progress' | 'waiting_for_user' | 'resolved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
type TicketCategory = 'general' | 'bug' | 'account' | 'match_dispute' | 'ban_appeal' | 'other';

type Ticket = {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusConfig: Record<TicketStatus, { label: string; color: string; dot: string }> = {
  open:             { label: 'Offen',             color: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-300' },
  in_progress:      { label: 'In Bearbeitung',    color: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',         dot: 'bg-cyan-300' },
  waiting_for_user: { label: 'Warte auf dich',    color: 'border-amber-300/25 bg-amber-400/10 text-amber-200',      dot: 'bg-amber-300' },
  resolved:         { label: 'Gelöst',            color: 'border-zinc-300/25 bg-zinc-400/10 text-zinc-300',         dot: 'bg-zinc-400' },
  closed:           { label: 'Geschlossen',       color: 'border-zinc-700/25 bg-zinc-800/10 text-zinc-500',         dot: 'bg-zinc-600' },
};

const categoryLabels: Record<TicketCategory, string> = {
  general:       'Allgemein',
  bug:           'Bug / Fehler',
  account:       'Account',
  match_dispute: 'Match-Streit',
  ban_appeal:    'Ban-Einspruch',
  other:         'Sonstiges',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SupportPage() {
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Neues Ticket
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [message, setMessage] = useState('');

  // Antwort
  const [replyText, setReplyText] = useState('');

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // Auth-Check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/auth/login');
    });
  }, [supabase, router]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('get_my_tickets');
    if (!err && data) setTickets(data as Ticket[]);
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.18),transparent_32%),radial-gradient(circle_at_80%_8%,rgba(6,182,212,0.10),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_72%)]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      {/* Nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-lg font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-base font-black tracking-[-0.04em] md:text-xl">RANKEDDARTS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Support</div>
            </div>
          </Link>
          <div className="hidden items-center gap-7 text-sm font-medium text-zinc-300 lg:flex">
            <Link href="/matchmaking" className="transition hover:text-white">Matchmaking</Link>
            <Link href="/leaderboard" className="transition hover:text-white">Leaderboard</Link>
            <Link href="/profile" className="transition hover:text-white">Profil</Link>
            <Link href="/history" className="transition hover:text-white">History</Link>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:bg-white/10 lg:hidden">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-white/10 bg-black/80 px-5 py-4 backdrop-blur-2xl lg:hidden">
            <div className="flex flex-col gap-1">
              <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Matchmaking</Link>
              <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Leaderboard</Link>
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">Profil</Link>
              <Link href="/history" onClick={() => setMobileMenuOpen(false)} className="rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white">History</Link>
            </div>
          </div>
        )}
      </nav>

      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-5 md:px-8 md:pt-32">

        {/* ── TICKET-LISTE ── */}
        {view === 'list' && (
          <>
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-emerald-200">
                  <Headphones size={13} /> Support
                </div>
                <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Meine Tickets</h1>
                <p className="mt-2 text-zinc-400">Erstelle ein Support-Ticket oder verfolge bestehende Anfragen.</p>
              </div>
              <button
                onClick={() => { setView('new'); setError(''); setSuccess(''); }}
                className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-5 py-3 font-black text-sm uppercase tracking-[0.14em] text-black shadow-[0_8px_30px_rgba(34,197,94,0.2)] transition hover:-translate-y-0.5"
              >
                <Plus size={16} /> Neu
              </button>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
                <XCircle size={18} className="shrink-0" /> {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-emerald-400" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-[2rem] border border-white/10 bg-zinc-950/80 py-20 text-center backdrop-blur-xl">
                <Headphones className="h-12 w-12 text-zinc-700" />
                <p className="text-lg font-black text-zinc-500">Noch keine Tickets</p>
                <p className="text-sm text-zinc-600">Erstelle dein erstes Support-Ticket wenn du Hilfe benötigst.</p>
                <button onClick={() => setView('new')} className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-200 transition hover:bg-emerald-400/20">
                  <Plus size={15} /> Ticket erstellen
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((t) => {
                  const sc = statusConfig[t.status];
                  return (
                    <button
                      key={t.id}
                      onClick={() => void openDetail(t.id)}
                      className="group w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/80 p-5 text-left backdrop-blur-xl transition hover:border-white/20 hover:bg-zinc-900/80"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${sc.color}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                              {sc.label}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-400">
                              {categoryLabels[t.category]}
                            </span>
                          </div>
                          <p className="truncate text-base font-black text-white">{t.subject}</p>
                          <p className="mt-1 text-xs text-zinc-500">{formatDate(t.updated_at)} · {t.message_count} Nachricht{t.message_count !== 1 ? 'en' : ''}</p>
                        </div>
                        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-zinc-600 transition group-hover:text-zinc-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── NEUES TICKET ── */}
        {view === 'new' && (
          <>
            <button onClick={() => setView('list')} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white">
              <ArrowLeft size={16} /> Zurück zu meinen Tickets
            </button>

            <div className="overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/85 shadow-2xl shadow-black/60 backdrop-blur-2xl">
              <div className="border-b border-white/10 px-8 py-7">
                <div className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Support</div>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Neues Ticket</h2>
                <p className="mt-1 text-sm text-zinc-500">Beschreibe dein Anliegen so genau wie möglich.</p>
              </div>

              <div className="space-y-5 px-8 py-7">
                {error && (
                  <div className="flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
                    <AlertCircle size={16} className="shrink-0" /> {error}
                  </div>
                )}
                {success && (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-100">
                    <CheckCircle2 size={16} className="shrink-0" /> {success}
                  </div>
                )}

                {/* Kategorie */}
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Kategorie</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(Object.entries(categoryLabels) as [TicketCategory, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCategory(key)}
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          category === key
                            ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                            : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Betreff */}
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Betreff</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Kurze Beschreibung des Problems"
                    maxLength={120}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.07]"
                  />
                </div>

                {/* Nachricht */}
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">Nachricht</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Beschreibe dein Anliegen detailliert..."
                    rows={5}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.07]"
                  />
                </div>

                <button
                  onClick={() => void submitNewTicket()}
                  disabled={sending || !subject.trim() || !message.trim()}
                  className="w-full rounded-3xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 py-4 font-black uppercase tracking-[0.16em] text-black shadow-[0_12px_40px_rgba(34,197,94,0.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? 'Wird gesendet…' : 'Ticket einreichen'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── TICKET-DETAIL ── */}
        {view === 'detail' && detail && (
          <>
            <button onClick={() => { setView('list'); setDetail(null); }} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white">
              <ArrowLeft size={16} /> Zurück zu meinen Tickets
            </button>

            {/* Header */}
            <div className="mb-5 overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/80 backdrop-blur-xl">
              <div className="border-b border-white/10 px-6 py-5">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {(() => {
                    const sc = statusConfig[detail.ticket.status];
                    return (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${sc.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    );
                  })()}
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-zinc-400">
                    {categoryLabels[detail.ticket.category]}
                  </span>
                </div>
                <h2 className="text-2xl font-black tracking-[-0.04em]">{detail.ticket.subject}</h2>
                <p className="mt-1 text-xs text-zinc-500">Erstellt am {formatDate(detail.ticket.created_at)}</p>
              </div>

              {/* Nachrichten */}
              <div className="divide-y divide-white/[0.06] px-6 py-4 space-y-0">
                {detail.messages.map((msg) => (
                  <div key={msg.id} className={`py-4 ${msg.is_staff ? 'pl-4 border-l-2 border-emerald-300/30' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-black ${msg.is_staff ? 'text-emerald-300' : 'text-white'}`}>
                        {msg.sender_name}
                      </span>
                      {msg.is_staff && (
                        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-300">
                          Support
                        </span>
                      )}
                      <span className="ml-auto text-xs text-zinc-600">{formatDate(msg.created_at)}</span>
                    </div>
                    <p className="text-sm leading-7 text-zinc-300 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ))}
              </div>

              {/* Antwort-Box */}
              {!['resolved', 'closed'].includes(detail.ticket.status) && (
                <div className="border-t border-white/10 px-6 py-5">
                  <div className="flex gap-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Antwort schreiben…"
                      rows={3}
                      className="flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/40 focus:bg-white/[0.07]"
                    />
                    <button
                      onClick={() => void sendReply()}
                      disabled={sending || !replyText.trim()}
                      className="grid h-12 w-12 shrink-0 place-items-center self-end rounded-2xl bg-gradient-to-br from-emerald-400 to-lime-300 text-black transition hover:scale-105 disabled:opacity-40"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                  {error && <p className="mt-2 text-xs font-semibold text-red-300">{error}</p>}
                </div>
              )}

              {['resolved', 'closed'].includes(detail.ticket.status) && (
                <div className="border-t border-white/10 px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <CheckCircle2 size={15} className="text-zinc-600" />
                    Dieses Ticket ist geschlossen. Erstelle ein neues Ticket falls du weitere Hilfe benötigst.
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

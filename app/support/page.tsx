'use client';
/* eslint-disable @next/next/no-img-element -- Ticket attachments use arbitrary signed storage URLs. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { verifyCaptcha } from '@/lib/captcha-client';
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
  Image as ImageIcon,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Upload,
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

type SupportImage = {
  file: File;
  previewUrl: string;
};

type ParsedMessageContent = {
  text: string;
  images: { label: string; url: string }[];
};

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPPORT_IMAGE_BUCKET = 'dispute-screenshots';
const SUPPORT_IMAGE_FOLDER = 'support-tickets';
const MAX_SUPPORT_IMAGES = 4;
const MAX_SUPPORT_IMAGE_SIZE = 5 * 1024 * 1024;

const statusConfig: Record<TicketStatus, { label: string; color: string; dot: string; bg: string; ring: string }> = {
  open:             { label: 'Offen',           color: 'text-emerald-200', dot: 'bg-emerald-300', bg: 'border-emerald-300/20 bg-emerald-400/10', ring: 'shadow-emerald-400/10' },
  in_progress:      { label: 'In Bearbeitung',  color: 'text-cyan-200',    dot: 'bg-cyan-300',    bg: 'border-cyan-300/20 bg-cyan-400/10',       ring: 'shadow-cyan-400/10' },
  waiting_for_user: { label: 'Warte auf dich',  color: 'text-amber-200',   dot: 'bg-amber-300',   bg: 'border-amber-300/20 bg-amber-400/10',     ring: 'shadow-amber-400/10' },
  resolved:         { label: 'Gelöst',          color: 'text-zinc-300',    dot: 'bg-zinc-400',    bg: 'border-zinc-400/20 bg-zinc-400/10',       ring: 'shadow-zinc-400/5' },
  closed:           { label: 'Geschlossen',     color: 'text-zinc-500',    dot: 'bg-zinc-600',    bg: 'border-zinc-700/20 bg-zinc-800/10',       ring: 'shadow-zinc-800/5' },
};

const categoryConfig: Record<TicketCategory, { label: string; icon: React.ReactNode; color: string; desc: string; glow: string }> = {
  general:       { label: 'Allgemein',     icon: <HelpCircle size={20} />, color: 'border-zinc-300/20 bg-zinc-400/10 text-zinc-200',       desc: 'Allgemeine Fragen & Feedback',      glow: 'from-zinc-300/15' },
  bug:           { label: 'Bug / Fehler',  icon: <Bug size={20} />,        color: 'border-red-300/20 bg-red-400/10 text-red-200',          desc: 'Technische Probleme melden',        glow: 'from-red-400/15' },
  account:       { label: 'Account',       icon: <User size={20} />,       color: 'border-blue-300/20 bg-blue-400/10 text-blue-200',       desc: 'Login, Profil, Einstellungen',      glow: 'from-blue-400/15' },
  match_dispute: { label: 'Match-Streit',  icon: <Gavel size={20} />,      color: 'border-amber-300/20 bg-amber-400/10 text-amber-200',    desc: 'Probleme mit einem Match',          glow: 'from-amber-400/15' },
  ban_appeal:    { label: 'Ban-Einspruch', icon: <Shield size={20} />,     color: 'border-violet-300/20 bg-violet-400/10 text-violet-200', desc: 'Einspruch gegen eine Sperre',        glow: 'from-violet-400/15' },
  other:         { label: 'Sonstiges',     icon: <Sparkles size={20} />,   color: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200', desc: 'Alles andere',                    glow: 'from-emerald-400/15' },
};

const helpGuides: { title: string; description: string; category: TicketCategory; keywords: string; ticketSubject: string }[] = [
  { title: 'Match-Ergebnis stimmt nicht', description: 'Was du bei falschem Ergebnis, Abbruch oder einer strittigen Wertung tun kannst.', category: 'match_dispute', keywords: 'match ergebnis wertung elo gegner abbruch', ticketSubject: 'Problem mit einem Match-Ergebnis' },
  { title: 'Elo & Rangliste', description: 'Hilfe bei Elo-Änderungen, Ranglistenplatz oder nicht übernommenen Matches.', category: 'match_dispute', keywords: 'elo rating ranking rangliste punkte', ticketSubject: 'Frage zu Elo oder Rangliste' },
  { title: 'Login & Account', description: 'Unterstützung bei Zugang, Profil, E-Mail oder deinen Account-Einstellungen.', category: 'account', keywords: 'login konto account profil email passwort', ticketSubject: 'Hilfe mit meinem Account' },
  { title: 'Technisches Problem', description: 'Melde einen Fehler auf der Website oder beim Matchmaking mit Screenshots.', category: 'bug', keywords: 'bug fehler technisch website matchmaking ladefehler', ticketSubject: 'Technisches Problem melden' },
  { title: 'Spieler oder Verhalten melden', description: 'Melde uns einen Vorfall nachvollziehbar mit Match-ID und Belegen.', category: 'match_dispute', keywords: 'spieler melden report verhalten beleidigung betrug', ticketSubject: 'Vorfall in einem Match melden' },
  { title: 'Sperre anfechten', description: 'Informationen für einen begründeten Einspruch gegen eine Kontosperre.', category: 'ban_appeal', keywords: 'ban sperre einspruch gesperrt', ticketSubject: 'Einspruch gegen eine Sperre' },
];

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

function priorityLabel(priority: string) {
  const value = priority?.toLowerCase();
  if (value === 'urgent') return 'Dringend';
  if (value === 'high') return 'Hoch';
  if (value === 'low') return 'Niedrig';
  return 'Normal';
}

function ticketIsClosed(status: TicketStatus) {
  return status === 'resolved' || status === 'closed';
}


function parseMessageContent(content: string): ParsedMessageContent {
  const images: ParsedMessageContent['images'] = [];
  const text = content
    .replace(/\n?\[Bildanhang: ([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) => {
      images.push({ label, url });
      return '';
    })
    .trim();

  return { text, images };
}

function imageAlt(fileName: string) {
  return fileName.replace(/[-_]+/g, ' ').replace(/\.[^/.]+$/, '').trim() || 'Support-Bildanhang';
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
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
            {[["Matchmaking", "/matchmaking"], ["Leaderboard", "/leaderboard"], ["Profil", "/profile"], ["History", "/history"]].map(([label, href]) => (
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
  const [ticketListFilter, setTicketListFilter] = useState<'all' | 'attention' | 'active' | 'completed'>('all');
  const [helpSearch, setHelpSearch] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Neues Ticket
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('general');
  const [message, setMessage] = useState('');
  const [ticketImages, setTicketImages] = useState<SupportImage[]>([]);

  // Antwort
  const [replyText, setReplyText] = useState('');
  const [replyImages, setReplyImages] = useState<SupportImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  const newTicketFileRef = useRef<HTMLInputElement | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadTickets();
    }
    return () => { mounted = false; };
  }, [loadTickets]);


  useEffect(() => {
    return () => {
      ticketImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      replyImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, [ticketImages, replyImages]);

  const addImages = (files: FileList | null, target: 'ticket' | 'reply') => {
    if (!files?.length) return;

    const setImages = target === 'ticket' ? setTicketImages : setReplyImages;
    setError('');

    setImages((current) => {
      const next = [...current];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_SUPPORT_IMAGES) {
          setError(`Du kannst maximal ${MAX_SUPPORT_IMAGES} Bilder pro Nachricht anhängen.`);
          break;
        }

        if (!file.type.startsWith('image/')) {
          setError('Bitte lade nur Bilddateien hoch.');
          continue;
        }

        if (file.size > MAX_SUPPORT_IMAGE_SIZE) {
          setError('Ein Bild darf maximal 5 MB groß sein.');
          continue;
        }

        next.push({ file, previewUrl: URL.createObjectURL(file) });
      }
      return next;
    });
  };

  const removeImage = (index: number, target: 'ticket' | 'reply') => {
    const setImages = target === 'ticket' ? setTicketImages : setReplyImages;
    setImages((current) => {
      const image = current[index];
      if (image) URL.revokeObjectURL(image.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  };

  const clearImages = (target: 'ticket' | 'reply') => {
    const images = target === 'ticket' ? ticketImages : replyImages;
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    if (target === 'ticket') {
      setTicketImages([]);
      if (newTicketFileRef.current) newTicketFileRef.current.value = '';
    } else {
      setReplyImages([]);
      if (replyFileRef.current) replyFileRef.current.value = '';
    }
  };

  const uploadSupportImages = async (images: SupportImage[], ticketId: string) => {
    if (images.length === 0) return [];

    setUploadingImages(true);
    try {
      const uploaded: { label: string; url: string }[] = [];

      for (const image of images) {
        const ext = image.file.name.split('.').pop()?.toLowerCase() || 'png';
        const safeName = image.file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
        const path = `${SUPPORT_IMAGE_FOLDER}/${ticketId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(SUPPORT_IMAGE_BUCKET)
          .upload(path, image.file, { contentType: image.file.type, upsert: false });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(SUPPORT_IMAGE_BUCKET).getPublicUrl(path);
        uploaded.push({ label: safeName, url: data.publicUrl });
      }

      return uploaded;
    } finally {
      setUploadingImages(false);
    }
  };

  const contentWithImages = (text: string, images: { label: string; url: string }[]) => {
    const imageLines = images.map((image) => `[Bildanhang: ${image.label}](${image.url})`);
    return [text.trim(), ...imageLines].filter(Boolean).join('\n\n');
  };

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
    try {
      const captcha = await verifyCaptcha('support', captchaToken);
      if (!captcha.ok) throw new Error(captcha.error || 'Sicherheitsprüfung fehlgeschlagen.');
      const rateLimitResponse = await fetch('/api/rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'support' }),
      });
      if (!rateLimitResponse.ok) {
        const payload = await rateLimitResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Die Sicherheitsprüfung ist gerade nicht verfügbar.');
      }
      const uploadedImages = await uploadSupportImages(ticketImages, `new-${Date.now()}`);
      const { error: err } = await supabase.rpc('create_ticket', {
        p_subject:  subject.trim(),
        p_category: category,
        p_message:  contentWithImages(message, uploadedImages),
      });
      if (err) throw err;
      setSuccess('Ticket wurde erstellt! Wir melden uns so schnell wie möglich.');
      setSubject(''); setCategory('general'); setMessage(''); clearImages('ticket');
      await loadTickets();
      setTimeout(() => { setSuccess(''); setView('list'); }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bild-Upload oder Ticket-Erstellung fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if ((!replyText.trim() && replyImages.length === 0) || !detail) return;
    setSending(true); setError('');
    try {
      const rateLimitResponse = await fetch('/api/rate-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'support' }),
      });
      if (!rateLimitResponse.ok) {
        const payload = await rateLimitResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Die Sicherheitsprüfung ist gerade nicht verfügbar.');
      }
      const uploadedImages = await uploadSupportImages(replyImages, detail.ticket.id);
      const { error: err } = await supabase.rpc('send_ticket_message', {
        p_ticket_id: detail.ticket.id,
        p_content:   contentWithImages(replyText, uploadedImages),
      });
      if (err) throw err;
      setReplyText(''); clearImages('reply');
      await openDetail(detail.ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Antwort oder Bild-Upload fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  };

  const openCount  = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const waitCount  = tickets.filter(t => t.status === 'waiting_for_user').length;
  const doneCount  = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  const latestTicket = tickets[0];
  const visibleTickets = tickets.filter((ticket) => {
    if (ticketListFilter === 'attention') return ticket.status === 'waiting_for_user';
    if (ticketListFilter === 'active') return ticket.status === 'open' || ticket.status === 'in_progress';
    if (ticketListFilter === 'completed') return ticketIsClosed(ticket.status);
    return true;
  });
  const matchingGuides = helpGuides.filter((guide) => {
    const query = helpSearch.trim().toLowerCase();
    return !query || `${guide.title} ${guide.description} ${guide.keywords}`.toLowerCase().includes(query);
  });
  const openTicketForGuide = (guide: typeof helpGuides[number]) => {
    setCategory(guide.category);
    setSubject((current) => current || guide.ticketSubject);
    setError('');
    setSuccess('');
    setView('new');
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(139,92,246,0.20),transparent_38%),radial-gradient(ellipse_at_88%_8%,rgba(34,197,94,0.13),transparent_28%),radial-gradient(ellipse_at_52%_88%,rgba(6,182,212,0.09),transparent_42%)]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />
        <div className="absolute -left-40 top-52 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <Navbar onLogout={logout} />

      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-28 sm:px-5 md:px-8 md:pt-32">
        {view === 'list' && (
          <>
            <div className="mb-8 grid gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-violet-200">
                  <Headphones size={13} /> RankedDarts Help Center
                </div>
                <h1 className="mt-4 max-w-3xl text-5xl font-black tracking-[-0.07em] sm:text-6xl lg:text-7xl">
                  Wie können wir<br />
                  <span className="bg-gradient-to-r from-violet-300 via-emerald-200 to-cyan-300 bg-clip-text text-transparent">dir helfen?</span>
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg">
                  Suche zuerst nach einer passenden Lösung. Falls dein Anliegen offen bleibt, leitest du direkt daraus ein strukturiertes Ticket ab.
                </p>
                <label className="group mt-6 flex max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 shadow-2xl shadow-black/25 transition focus-within:border-violet-300/40 focus-within:bg-white/[0.045]">
                  <Search size={19} className="shrink-0 text-zinc-500 transition group-focus-within:text-violet-200" />
                  <input value={helpSearch} onChange={(event) => setHelpSearch(event.target.value)} placeholder="Suche nach Match, Elo, Login oder technischem Problem…" className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-600" />
                  <kbd className="hidden rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-black text-zinc-600 sm:block">Suchen</kbd>
                </label>
              </div>

              <div className="rounded-[2.25rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                    <Zap size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-emerald-200">Bevor du ein Ticket öffnest</p>
                    <p className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">Schnell zur Lösung</p>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">Wähle den passenden Kontaktgrund. Bei Match-Streitigkeiten bitte Match-ID, Gegnername und Screenshots direkt mitschicken.</p>
                  </div>
                </div>
              </div>
            </div>

            <section className="mb-8 rounded-[2.25rem] border border-white/10 bg-zinc-950/65 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">Schnellhilfe</p><h2 className="mt-1 text-2xl font-black tracking-[-0.045em] text-white">Beliebte Themen</h2></div>
                <p className="text-sm text-zinc-600">{matchingGuides.length} passende Hilfe{matchingGuides.length !== 1 ? '-Themen' : '-Thema'}</p>
              </div>
              {matchingGuides.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center"><Search className="mx-auto h-6 w-6 text-zinc-600" /><p className="mt-3 text-sm font-bold text-zinc-400">Kein passender Artikel gefunden.</p><button onClick={() => { setHelpSearch(''); setView('new'); }} className="mt-3 text-sm font-black text-violet-200 transition hover:text-white">Ticket stattdessen erstellen →</button></div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {matchingGuides.map((guide) => {
                    const cfg = categoryConfig[guide.category];
                    return <button key={guide.title} onClick={() => openTicketForGuide(guide)} className="group rounded-[1.55rem] border border-white/10 bg-white/[0.025] p-5 text-left transition hover:-translate-y-0.5 hover:border-violet-300/30 hover:bg-white/[0.05]">
                      <div className="flex items-start gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${cfg.color}`}>{cfg.icon}</span><div className="min-w-0"><p className="font-black tracking-[-0.02em] text-white">{guide.title}</p><p className="mt-2 text-sm leading-6 text-zinc-500">{guide.description}</p></div></div>
                      <span className="mt-4 inline-flex items-center gap-2 text-xs font-black text-violet-200 transition group-hover:gap-3">Hilfe oder Ticket öffnen <ChevronRight size={14} /></span>
                    </button>;
                  })}
                </div>
              )}
            </section>

            <div className="mb-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Aktive Tickets', value: openCount, icon: <MessageCircle size={16} />, tone: 'text-emerald-300 bg-emerald-400/10 border-emerald-300/20' },
                { label: 'Warte auf dich', value: waitCount, icon: <Clock size={16} />, tone: 'text-amber-300 bg-amber-400/10 border-amber-300/20' },
                { label: 'Gelöst', value: doneCount, icon: <CheckCircle2 size={16} />, tone: 'text-zinc-300 bg-zinc-400/10 border-zinc-400/20' },
              ].map((item) => (
                <div key={item.label} className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/70 p-5 backdrop-blur-xl">
                  <div className={`absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-2xl border ${item.tone}`}>{item.icon}</div>
                  <div className="text-4xl font-black tracking-[-0.06em] text-white">{item.value}</div>
                  <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{item.label}</div>
                </div>
              ))}
            </div>

            {waitCount > 0 && (
              <button
                onClick={() => setTicketListFilter('attention')}
                className="mb-8 flex w-full items-center gap-4 rounded-[1.75rem] border border-amber-300/25 bg-gradient-to-r from-amber-400/12 via-amber-400/[0.055] to-transparent p-4 text-left transition hover:border-amber-300/45 hover:bg-amber-400/10 sm:p-5"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-300/30 bg-amber-400/15 text-amber-200"><AlertCircle size={19} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-amber-100">Deine Antwort wird benötigt</p>
                  <p className="mt-1 text-sm text-amber-100/65">{waitCount} Ticket{waitCount !== 1 ? 's warten' : ' wartet'} auf weitere Informationen von dir.</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-amber-200" />
              </button>
            )}

            <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
              <div className="space-y-4">
                <button
                  onClick={() => { setView('new'); setError(''); setSuccess(''); }}
                  className="group relative flex w-full items-center justify-between overflow-hidden rounded-[2rem] border border-violet-400/25 bg-gradient-to-br from-violet-500/14 via-purple-500/8 to-white/[0.03] p-6 text-left shadow-2xl shadow-violet-950/20 transition hover:-translate-y-0.5 hover:border-violet-300/40 hover:shadow-violet-900/30"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
                  <div>
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-violet-300">Neues Ticket</div>
                    <div className="text-2xl font-black tracking-[-0.04em] text-white">Problem melden</div>
                    <div className="mt-2 max-w-xs text-sm leading-6 text-zinc-500">Wähle eine Kategorie und beschreibe dein Anliegen strukturiert.</div>
                  </div>
                  <div className="ml-4 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-400 to-purple-300 text-black shadow-[0_8px_30px_rgba(139,92,246,0.3)] transition group-hover:scale-105">
                    <Plus size={22} />
                  </div>
                </button>

                <div className="rounded-[2rem] border border-white/10 bg-zinc-950/60 p-5 backdrop-blur-xl">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">Tipp</p>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">Je genauer du den Ablauf beschreibst, desto schneller kann das Team dein Anliegen lösen.</p>
                  {latestTicket && (
                    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                      <p className="text-xs text-zinc-600">Letzte Aktivität</p>
                      <p className="mt-1 truncate text-sm font-black text-zinc-200">{latestTicket.subject}</p>
                      <p className="mt-1 text-xs text-zinc-600">{timeAgo(latestTicket.updated_at)}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="min-h-[420px] rounded-[2.25rem] border border-white/10 bg-zinc-950/70 p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-5">
                {error && (
                  <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
                    <XCircle size={18} className="shrink-0" /> {error}
                  </div>
                )}

                {loading ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-violet-400" />
                    <p className="text-sm font-bold text-zinc-600">Tickets werden geladen…</p>
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
                    <div className="grid h-20 w-20 place-items-center rounded-[1.75rem] border border-violet-400/20 bg-violet-400/10">
                      <Headphones className="h-9 w-9 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-zinc-300">Noch keine Tickets</p>
                      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-600">Erstelle dein erstes Ticket, wenn du Hilfe benötigst oder ein Match geprüft werden soll.</p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 flex flex-col gap-4 px-1 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">Deine Tickets</p>
                        <p className="mt-1 text-sm text-zinc-500">{visibleTickets.length} von {tickets.length} Anfrage{tickets.length !== 1 ? 'n' : ''}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['all', 'Alle'],
                          ['attention', 'Deine Aktion'],
                          ['active', 'Aktiv'],
                          ['completed', 'Erledigt'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            onClick={() => setTicketListFilter(value as typeof ticketListFilter)}
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.13em] transition ${ticketListFilter === value ? 'border-violet-300/40 bg-violet-400/15 text-violet-100' : 'border-white/10 bg-white/[0.025] text-zinc-500 hover:border-white/20 hover:text-zinc-200'}`}
                          >
                            {label}{value === 'attention' && waitCount > 0 ? ` · ${waitCount}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                    {visibleTickets.length === 0 ? (
                      <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
                        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-300/70" />
                        <p className="mt-3 text-sm font-black text-zinc-300">Alles im Blick</p>
                        <p className="mt-1 text-sm text-zinc-600">Für diesen Filter gibt es gerade keine Tickets.</p>
                      </div>
                    ) : (
                    <div className="space-y-3">
                      {visibleTickets.map((t) => {
                        const sc = statusConfig[t.status];
                        const cc = categoryConfig[t.category];
                        return (
                          <button
                            key={t.id}
                            onClick={() => void openDetail(t.id)}
                            className={`group relative w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.055] hover:shadow-2xl ${sc.ring}`}
                          >
                            <div className={`absolute inset-y-4 left-0 w-1 rounded-r-full ${sc.dot}`} />
                            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${cc.glow} via-transparent to-transparent opacity-0 transition group-hover:opacity-100`} />
                            <div className="relative flex items-start justify-between gap-4 pl-3">
                              <div className="min-w-0 flex-1">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${sc.bg} ${sc.color}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                                    {sc.label}
                                  </span>
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${cc.color}`}>
                                    {cc.label}
                                  </span>
                                </div>
                                <p className="truncate text-lg font-black tracking-[-0.03em] text-white">{t.subject}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
                                  <span className="flex items-center gap-1.5"><MessageCircle size={12} /> {t.message_count} Nachricht{t.message_count !== 1 ? 'en' : ''}</span>
                                  <span className="hidden sm:inline">·</span>
                                  <span>Aktualisiert {timeAgo(t.updated_at)}</span>
                                </div>
                              </div>
                              <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-zinc-700 transition group-hover:translate-x-1 group-hover:text-zinc-300" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {view === 'new' && (
          <>
            <button onClick={() => setView('list')} className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white">
              <ArrowLeft size={16} /> Zurück
            </button>

            <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_0.75fr] lg:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.22em] text-violet-200">
                  <Plus size={12} /> Support-Anfrage
                </div>
                <h2 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-6xl">Anfrage senden</h2>
                <p className="mt-4 max-w-2xl text-zinc-500">Wähle zuerst den passenden Kontaktgrund und schildere anschließend dein Anliegen. Dein Ticket-Verlauf bleibt danach als Konversation verfügbar.</p>
              </div>
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-600">Gute Beschreibung</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Nenne Zeitpunkt, betroffene Seite, Gegnername oder Match-ID und was du bereits versucht hast.</p>
              </div>
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
                  <div className="text-base font-black text-emerald-200">Ticket eingereicht!</div>
                  <div className="mt-0.5 text-emerald-300/80">{success}</div>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
                  <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-400/15 text-sm font-black text-violet-300">1</div>
                  <div>
                    <div className="text-sm font-black text-white">Kontaktgrund wählen</div>
                    <div className="text-xs text-zinc-600">Worum geht es bei deiner Anfrage?</div>
                  </div>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  {(Object.entries(categoryConfig) as [TicketCategory, typeof categoryConfig[TicketCategory]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={`relative flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition ${
                        category === key
                          ? `${cfg.color} shadow-[0_0_22px_rgba(139,92,246,0.12)]`
                          : 'border-white/10 bg-white/[0.03] text-zinc-500 hover:border-white/20 hover:text-zinc-300'
                      }`}
                    >
                      {category === key && <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-current opacity-70" />}
                      <div className={category === key ? '' : 'text-zinc-600'}>{cfg.icon}</div>
                      <div>
                        <div className="text-sm font-black">{cfg.label}</div>
                        <div className={`mt-0.5 text-[11px] leading-4 ${category === key ? 'opacity-70' : 'text-zinc-700'}`}>{cfg.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                  <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-400/15 text-sm font-black text-violet-300">2</div>
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
                      placeholder="z.B. Match wurde falsch gewertet"
                      maxLength={120}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
                    />
                    <div className="mt-2 flex justify-end text-xs text-zinc-700">{subject.length}/120</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 backdrop-blur-xl">
                  <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-400/15 text-sm font-black text-violet-300">3</div>
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
                      rows={8}
                      className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/40 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)]"
                    />
                    <div className="mt-2 flex justify-end text-xs text-zinc-700">{message.length} Zeichen</div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Bilder anhängen</p>
                          <p className="mt-1 text-xs leading-5 text-zinc-600">Bis zu {MAX_SUPPORT_IMAGES} Bilder, maximal 5 MB pro Datei.</p>
                        </div>
                        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-violet-300/20 bg-violet-400/10 px-4 py-3 text-xs font-black text-violet-200 transition hover:border-violet-300/40 hover:bg-violet-400/15">
                          <Upload size={14} /> Bilder auswählen
                          <input ref={newTicketFileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files, 'ticket')} />
                        </label>
                      </div>
                      {ticketImages.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {ticketImages.map((image, index) => (
                            <div key={image.previewUrl} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                              <img src={image.previewUrl} alt={imageAlt(image.file.name)} className="h-32 w-full object-cover" />
                              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/70 px-3 py-2 text-xs backdrop-blur">
                                <span className="truncate font-bold text-zinc-200">{image.file.name}</span>
                                <button type="button" onClick={() => removeImage(index, 'ticket')} className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-red-400/15 text-red-200 transition hover:bg-red-400/25" aria-label="Bild entfernen"><Trash2 size={13} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <TurnstileWidget action="support" onToken={setCaptchaToken} />
                <button
                  onClick={() => void submitNewTicket()}
                  disabled={sending || uploadingImages || !subject.trim() || !message.trim()}
                  className="group relative w-full overflow-hidden rounded-3xl bg-gradient-to-r from-violet-500 via-purple-400 to-violet-500 py-5 font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_50px_rgba(139,92,246,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(139,92,246,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    {sending ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />{uploadingImages ? 'Bilder werden hochgeladen…' : 'Wird gesendet…'}</> : <><Send size={17} />Ticket einreichen</>}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}

        {view === 'detail' && detail && (() => {
          const sc = statusConfig[detail.ticket.status];
          const cc = categoryConfig[detail.ticket.category];
          const closed = ticketIsClosed(detail.ticket.status);
          return (
            <>
              <button onClick={() => { setView('list'); setDetail(null); }} className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white">
                <ArrowLeft size={16} /> Zurück zu meinen Tickets
              </button>

              <div className="mb-5 rounded-2xl border border-white/10 bg-zinc-950/80 shadow-2xl shadow-black/25 backdrop-blur-xl">
                <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Support-Anfrage · #{detail.ticket.id.slice(0, 8)}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] ${sc.bg} ${sc.color}`}>
                          <span className={`h-2 w-2 rounded-full ${sc.dot} ${!closed ? 'animate-pulse' : ''}`} />
                          {sc.label}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black ${cc.color}`}>
                          {cc.icon}
                          {cc.label}
                        </span>
                      </div>
                      <h2 className="mt-4 max-w-4xl text-2xl font-black tracking-[-0.045em] text-white sm:text-3xl">{detail.ticket.subject}</h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-500">Erstellt am {formatDate(detail.ticket.created_at)} · zuletzt aktualisiert {timeAgo(detail.ticket.updated_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-64 lg:justify-end">
                      <span className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-zinc-400">{detail.messages.length} Nachricht{detail.messages.length !== 1 ? 'en' : ''}</span>
                      <span className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-bold text-zinc-400">{priorityLabel(detail.ticket.priority)} Priorität</span>
                    </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.27fr_0.73fr]">
                <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
                  <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-xl">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">Anfragedetails</p>
                    <div className="mt-3 space-y-2">
                      {[
                        ['Kategorie', cc.label],
                        ['Status', sc.label],
                        ['Priorität', priorityLabel(detail.ticket.priority)],
                        ['Erstellt', formatDate(detail.ticket.created_at)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-700">{label}</p>
                          <p className="mt-1 text-sm font-bold text-zinc-300">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-300/15 bg-violet-400/[0.06] p-4 backdrop-blur-xl">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200">
                        <Headphones size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-violet-100">So funktioniert es</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-500">Antworte direkt in diesem Verlauf. Das Team meldet sich hier bei dir.</p>
                      </div>
                    </div>
                  </div>
                </aside>

                <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-2xl shadow-black/25 backdrop-blur-xl">
                  <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200">
                        <MessageCircle size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">Konversation</p>
                        <p className="text-xs text-zinc-600">Antworten werden direkt in deiner Anfrage gespeichert</p>
                      </div>
                    </div>
                    <span className={`hidden rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] sm:inline-flex ${sc.bg} ${sc.color}`}>{sc.label}</span>
                  </div>

                  <div className="max-h-[640px] divide-y divide-white/[0.07] overflow-y-auto">
                    {detail.messages.map((msg) => {
                      const initials = msg.is_staff ? 'RD' : msg.sender_name.charAt(0).toUpperCase();
                      const parsed = parseMessageContent(msg.content);
                      return (
                        <article key={msg.id} className="flex gap-3 px-5 py-5 sm:px-6">
                          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-xs font-black ${msg.is_staff ? 'border-emerald-300/25 bg-emerald-400/15 text-emerald-200' : 'border-violet-300/20 bg-violet-400/12 text-violet-200'}`}>{initials}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className={`text-sm font-black ${msg.is_staff ? 'text-emerald-200' : 'text-zinc-100'}`}>{msg.is_staff ? 'RankedDarts Support' : msg.sender_name}</span>
                              {msg.is_staff && <span className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">Support</span>}
                              <span className="text-[11px] text-zinc-600">{formatDate(msg.created_at)}</span>
                            </div>
                            <div className="mt-3 space-y-4 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5">
                              {parsed.text && <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-200">{parsed.text}</p>}
                              {parsed.images.length > 0 && (
                                <div className="grid gap-3">
                                  {parsed.images.map((image) => (
                                    <a key={image.url} href={image.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10 bg-black/25 transition hover:border-white/25">
                                      <img src={image.url} alt={imageAlt(image.label)} className="max-h-80 w-full object-cover transition duration-300 group-hover:scale-[1.015]" />
                                      <div className="flex items-center gap-2 px-4 py-3 text-xs font-bold text-zinc-400">
                                        <ImageIcon size={14} className="text-violet-200" />
                                        <span className="truncate">{image.label}</span>
                                      </div>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  {!closed ? (
                    <div className="border-t border-white/10 bg-black/30 p-4 sm:p-5">
                      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Zur Konversation hinzufügen</p>
                          <p className="text-xs text-zinc-700">{replyText.length} Zeichen</p>
                        </div>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Schreibe eine Antwort…"
                          rows={4}
                          className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-4 py-3.5 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-700 focus:border-violet-300/40 focus:bg-white/[0.06]"
                        />
                        <div className="mt-3 flex flex-col gap-3 border-t border-white/[0.07] pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <label className="inline-flex w-fit cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-zinc-300 transition hover:border-violet-300/30 hover:text-white">
                              <Upload size={13} /> Anhang hinzufügen
                              <input ref={replyFileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addImages(e.target.files, 'reply')} />
                            </label>
                            <span className="text-xs text-zinc-600">PNG, JPG · max. {MAX_SUPPORT_IMAGES} Dateien</span>
                          {replyImages.length > 0 && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {replyImages.map((image, index) => (
                                <div key={image.previewUrl} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                                  <img src={image.previewUrl} alt={imageAlt(image.file.name)} className="h-24 w-full object-cover" />
                                  <button type="button" onClick={() => removeImage(index, 'reply')} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-xl bg-black/70 text-red-200 backdrop-blur transition hover:bg-red-400/25" aria-label="Bild entfernen"><Trash2 size={13} /></button>
                                  <div className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-3 py-1.5 text-[11px] font-bold text-zinc-200 backdrop-blur">{image.file.name}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {error && <p className="mt-3 text-xs font-semibold text-red-300">{error}</p>}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-xs leading-5 text-zinc-600">Deine Antwort ist für das Support-Team sichtbar.</span>
                          <button
                            onClick={() => void sendReply()}
                            disabled={sending || uploadingImages || (!replyText.trim() && replyImages.length === 0)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white shadow-[0_8px_25px_rgba(139,92,246,0.2)] transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {sending ? <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />{uploadingImages ? 'Anhang wird hochgeladen…' : 'Wird gesendet…'}</> : <><Send size={15} />Antwort senden</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-white/10 bg-black/20 p-5">
                      <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/50 bg-zinc-900/40 p-5 text-sm text-zinc-500">
                        <CheckCircle2 size={16} className="shrink-0 text-zinc-600" />
                        <span>Dieses Ticket ist geschlossen. Erstelle ein <button onClick={() => setView('new')} className="font-bold text-zinc-400 underline underline-offset-2 transition hover:text-white">neues Ticket</button>, falls du weitere Hilfe benötigst.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </section>
    </main>
  );
}

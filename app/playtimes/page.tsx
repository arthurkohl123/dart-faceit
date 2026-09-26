'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, ChevronRight, Clock3, LockKeyhole, Menu, Radar, ShieldCheck, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/BrandLogo';
import { createClient } from '@/lib/supabase';

type RankedSlot = {
  starts_at: string;
  ends_at: string;
  planned_players: number | string;
  joined_by_me: boolean;
};

type Notice = { tone: 'success' | 'error'; text: string } | null;

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function slotDateKey(startsAt: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(startsAt));
}

function slotStartLabel(startsAt: string) {
  return timeFormatter.format(new Date(startsAt));
}

function slotWindowLabel(startsAt: string, endsAt: string) {
  return `${timeFormatter.format(new Date(startsAt))}–${timeFormatter.format(new Date(endsAt))}`;
}

function slotStatus(slot: RankedSlot, now: number) {
  const start = new Date(slot.starts_at).getTime();
  const end = new Date(slot.ends_at).getTime();
  if (start <= now && end > now) return 'läuft jetzt';
  if (start - now <= 60 * 60 * 1000 && start > now) return 'beginnt gleich';
  return null;
}

function isBookable(slot: RankedSlot, now: number) {
  return new Date(slot.starts_at).getTime() >= now + 15 * 60 * 1000;
}

export default function PlaytimesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [slots, setSlots] = useState<RankedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadSlots = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/auth/login?redirectTo=%2Fplaytimes');
      return;
    }

    const { data, error } = await supabase.rpc('get_ranked_play_slots', { p_days: 7 });
    if (error) {
      setNotice({ tone: 'error', text: 'Spielzeiten konnten gerade nicht geladen werden. Bitte versuche es erneut.' });
      setLoading(false);
      return;
    }

    setSlots((data ?? []) as RankedSlot[]);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadSlots(), 0);
    const refresh = window.setInterval(() => {
      setNow(Date.now());
      void loadSlots();
    }, 60_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refresh);
    };
  }, [loadSlots]);

  const toggleSlot = async (slot: RankedSlot) => {
    const wasJoined = slot.joined_by_me;
    if (!wasJoined && !isBookable(slot, now)) {
      setNotice({ tone: 'error', text: 'Kurzfristige Slots können bis 15 Minuten vor Beginn geplant werden.' });
      return;
    }

    setBusySlot(slot.starts_at);
    setNotice(null);
    const { data, error } = await supabase.rpc('toggle_ranked_play_slot', { p_starts_at: slot.starts_at });
    if (error) {
      const message = error.message.includes('SLOT_LIMIT_REACHED')
        ? 'Du kannst bis zu sechs künftige Ranked-Slots gleichzeitig planen.'
        : error.message.includes('SLOT_OUT_OF_RANGE')
          ? 'Dieser Slot liegt zu nah oder zu weit in der Zukunft.'
          : 'Die Spielzeit konnte nicht geändert werden. Bitte versuche es erneut.';
      setNotice({ tone: 'error', text: message });
      setBusySlot(null);
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const joined = Boolean((result as { joined?: boolean } | null)?.joined);
    setSlots((current) => current.map((currentSlot) => currentSlot.starts_at === slot.starts_at
      ? {
          ...currentSlot,
          joined_by_me: joined,
          planned_players: Math.max(0, Number(currentSlot.planned_players) + (joined ? 1 : -1)),
        }
      : currentSlot));
    setNotice({ tone: 'success', text: joined ? `Du bist für ${slotWindowLabel(slot.starts_at, slot.ends_at)} dabei.` : 'Deine Spielzeit wurde entfernt.' });
    setBusySlot(null);
  };

  const groupedSlots = slots.reduce<Record<string, RankedSlot[]>>((groups, slot) => {
    const key = slotDateKey(slot.starts_at);
    groups[key] = [...(groups[key] ?? []), slot];
    return groups;
  }, {});
  const myUpcomingSlots = slots.filter((slot) => slot.joined_by_me && new Date(slot.starts_at).getTime() > now);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#0a0d0d] text-emerald-200"><span className="border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black">Spielzeiten werden geladen …</span></main>;
  }

  return (
    <main className="arena-page text-[#f5f3ee]">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 sport-grid opacity-25" />
      <nav className="arena-nav sticky top-0 z-30 border-b border-white/10 bg-[#0a0d0d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 md:px-8 md:py-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <BrandLogo className="h-9 w-9 shrink-0 rounded-lg sm:h-10 sm:w-10" />
            <span className="min-w-0"><span className="block truncate text-sm font-black tracking-[-.045em] sm:text-base">RANKEDDARTS</span><span className="hidden text-[9px] font-bold uppercase tracking-[.22em] text-emerald-300 sm:block">Ranked-Slots</span></span>
          </Link>
          <div className="hidden items-center gap-6 text-[13px] font-bold text-zinc-400 lg:flex">
            <Link href="/leaderboard" className="hover:text-white">Rangliste</Link>
            <Link href="/matchmaking" className="hover:text-white">Matchmaking</Link>
            <Link href="/playtimes" className="text-emerald-200">Spielzeiten</Link>
            <Link href="/tournaments" className="hover:text-white">Turniere</Link>
            <Link href="/history" className="hover:text-white">History</Link>
          </div>
          <button onClick={() => setMobileMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center border border-white/15 text-zinc-200 lg:hidden" aria-label="Menü öffnen">{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
        {mobileMenuOpen && <div className="border-t border-white/10 px-4 py-3 lg:hidden"><div className="mx-auto grid max-w-7xl gap-1 text-sm font-bold text-zinc-300">{[['Rangliste', '/leaderboard'], ['Matchmaking', '/matchmaking'], ['Spielzeiten', '/playtimes'], ['Turniere', '/tournaments'], ['History', '/history']].map(([label, href]) => <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="border-b border-white/5 py-3 hover:text-emerald-200">{label}</Link>)}</div></div>}
      </nav>

      <section className="arena-content mx-auto px-4 pb-10 pt-10 sm:px-6 md:px-8 md:pb-14 md:pt-16">
        <div className="arena-hero grid gap-8 pb-9 lg:grid-cols-[1.18fr_.82fr] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 border-l-2 border-emerald-300 pl-3 text-[10px] font-black uppercase tracking-[.19em] text-emerald-200"><CalendarClock className="h-3.5 w-3.5" /> Gemeinsam besser planbar</div>
            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[.87] tracking-[-.075em] sm:text-6xl md:text-7xl">Plane deine<br /><span className="text-emerald-300">Ranked-Zeit.</span></h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-7 text-zinc-400 sm:text-base">Trag dich für ein Zeitfenster ein, damit andere wissen: Dann lohnt sich die Queue. Du siehst dabei nur die Anzahl der Interessierten – keine Namen, keine Plattformen.</p>
          </div>
          <div className="arena-panel relative z-10 border-emerald-300/20 bg-emerald-400/[.06] p-5">
            <div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" /><div><div className="text-sm font-black text-emerald-100">Privat geplant, gemeinsam sichtbar.</div><p className="mt-1.5 text-sm leading-6 text-emerald-100/65">Es werden nur Gesamtzahlen angezeigt. Deine Auswahl ist nicht als Anwesenheit oder verbindliche Zusage sichtbar.</p></div></div>
            <Link href="/matchmaking" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-emerald-200 hover:text-emerald-100">Direkt zur Queue <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </div>

        {notice && <div className={`mt-6 flex items-start gap-3 border px-4 py-3 text-sm font-bold ${notice.tone === 'success' ? 'border-emerald-300/25 bg-emerald-400/[.08] text-emerald-100' : 'border-red-300/25 bg-red-400/[.08] text-red-100'}`}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{notice.text}</div>}

        <div className="arena-rail mt-8 grid gap-0 sm:grid-cols-3">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-white/10 bg-white/[.03] text-emerald-200"><Clock3 className="h-4 w-4" /></div><div><div className="text-lg font-black leading-none">17–23 Uhr</div><div className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-zinc-500">Tägliche Slots</div></div></div>
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-white/10 bg-white/[.03] text-emerald-200"><Users className="h-4 w-4" /></div><div><div className="text-lg font-black leading-none">{myUpcomingSlots.length}/6</div><div className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-zinc-500">Deine offenen Zeiten</div></div></div>
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-white/10 bg-white/[.03] text-emerald-200"><Radar className="h-4 w-4" /></div><div><div className="text-lg font-black leading-none">Anonym</div><div className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-zinc-500">Nur Gesamtinteresse</div></div></div>
        </div>

        {myUpcomingSlots.length > 0 && <section className="mt-8 border border-white/10 bg-[#0d1110] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-200">Deine nächste Spielzeit</div><div className="mt-1 text-lg font-black">{dateFormatter.format(new Date(myUpcomingSlots[0].starts_at))} · {slotWindowLabel(myUpcomingSlots[0].starts_at, myUpcomingSlots[0].ends_at)} Uhr</div></div><Link href="/matchmaking" className="inline-flex items-center justify-center gap-2 border border-emerald-300 bg-emerald-300 px-4 py-3 text-sm font-black text-[#07100b] transition hover:bg-emerald-200">Queue öffnen <ChevronRight className="h-4 w-4" /></Link></div></section>}

        <section className="mt-10">
          <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-zinc-500">Nächste sieben Tage</p><h2 className="mt-1 text-3xl font-black tracking-[-.055em]">Wann bist du am Oche?</h2></div><p className="max-w-md text-xs leading-5 text-zinc-500">Eine Auswahl ist jederzeit entfernbar. Vor dem Termin musst du selbst in die Queue gehen.</p></div>
          <div className="arena-schedule-board mt-5 grid gap-px bg-white/[.08] xl:grid-cols-2">
            {Object.entries(groupedSlots).map(([day, daySlots]) => <article key={day} className="overflow-hidden border border-white/10 bg-[#0d1110]"><header className="flex items-center justify-between border-b border-white/10 bg-black/15 px-4 py-3.5"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-zinc-500">Ranked-Slots</div><h3 className="mt-1 text-lg font-black">{dateFormatter.format(new Date(daySlots[0].starts_at))}</h3></div><span className="text-xs font-black text-emerald-200">{daySlots.filter((slot) => slot.joined_by_me).length ? 'Du bist dabei' : 'frei planbar'}</span></header><div className="divide-y divide-white/[.07]">{daySlots.map((slot) => {
              const planned = Number(slot.planned_players) || 0;
              const status = slotStatus(slot, now);
              const joined = slot.joined_by_me;
              const bookable = isBookable(slot, now);
              const busy = busySlot === slot.starts_at;
              const others = Math.max(0, planned - (joined ? 1 : 0));
              const interestLabel = joined
                ? others === 0 ? 'Noch niemand außer dir geplant' : `${others} ${others === 1 ? 'weitere Person' : 'weitere Personen'} geplant`
                : planned === 0 ? 'Noch niemand geplant' : `${planned} ${planned === 1 ? 'Person ist' : 'Personen sind'} dabei`;
              return <div key={slot.starts_at} className={`grid gap-3 px-4 py-3.5 sm:grid-cols-[.75fr_1fr_auto] sm:items-center ${joined ? 'bg-emerald-400/[.045]' : ''}`}><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center border text-xs font-black ${joined ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/10 text-zinc-200'}`}>{slotStartLabel(slot.starts_at)}</span><div><div className="text-sm font-black">{slotWindowLabel(slot.starts_at, slot.ends_at)} Uhr</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.1em] text-zinc-500">{status ?? (bookable ? 'geplant spielen' : 'nicht mehr planbar')}</div></div></div><div className="text-sm font-bold text-zinc-400"><span className="text-emerald-200">{interestLabel}</span>{joined && <span className="ml-2 text-[10px] font-black uppercase tracking-[.12em] text-emerald-200">deine Zeit</span>}</div>{status && !joined ? <Link href="/matchmaking" className="inline-flex items-center justify-center gap-2 border border-emerald-300/30 bg-emerald-400/[.08] px-3 py-2.5 text-xs font-black text-emerald-100 hover:bg-emerald-400/[.14]">{status === 'läuft jetzt' ? 'Jetzt suchen' : 'Queue öffnen'} <ChevronRight className="h-3.5 w-3.5" /></Link> : <button onClick={() => void toggleSlot(slot)} disabled={busy || (!joined && !bookable)} className={`inline-flex min-h-10 items-center justify-center gap-2 border px-3 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${joined ? 'border-emerald-300 bg-emerald-300 text-[#07100b] hover:bg-emerald-200' : 'border-white/15 text-zinc-100 hover:border-emerald-300/40 hover:bg-emerald-400/[.08]'}`}>{joined ? <><Check className="h-3.5 w-3.5" /> {busy ? '…' : 'Dabei'}</> : busy ? '…' : 'Ich bin dabei'}</button>}</div>;
            })}</div></article>)}
          </div>
        </section>
      </section>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Trophy, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';

type ShowdownStatus = {
  is_active: boolean;
  event_enabled: boolean;
  free_limit_override: boolean;
  starts_at: string;
  ends_at: string;
  minimum_matches: number;
  title: string;
};

type ShowdownConfig = {
  prize_first: string;
  prize_second: string;
  prize_third: string;
};

const fallbackConfig: ShowdownConfig = {
  prize_first: '15 €',
  prize_second: '14 Tage Premium',
  prize_third: '7 Tage Premium',
};

function eventDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function WednesdayShowdownPromo({ compact = false }: { compact?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<ShowdownStatus | null>(null);
  const [config, setConfig] = useState<ShowdownConfig>(fallbackConfig);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [statusResult, configResult] = await Promise.all([
        supabase.rpc('get_wednesday_showdown_status'),
        supabase.rpc('get_wednesday_showdown_public_config'),
      ]);
      if (!active) return;
      setStatus((statusResult.data?.[0] ?? null) as ShowdownStatus | null);
      setConfig((configResult.data?.[0] ?? fallbackConfig) as ShowdownConfig);
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [supabase]);

  if (status?.event_enabled === false) return null;
  const isLive = Boolean(status?.is_active);
  const isMakeupRepeat = Boolean(status?.title.includes('Wiederholung'));
  const eventTime = status?.starts_at ? eventDate(status.starts_at) : 'Jeden Mittwoch · 18:00 Uhr';
  const eyebrow = isLive ? 'Jetzt live · 18–22 Uhr' : isMakeupRepeat ? 'Heute · Wiederholung · 18–22 Uhr' : `Nächster Showdown · ${eventTime}`;

  if (compact) {
    return (
      <Link href="/showdown" className="group mt-7 flex flex-col gap-4 border border-violet-300/25 bg-violet-400/[.07] p-5 transition hover:border-violet-200/60 hover:bg-violet-400/[.11] sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-w-0 items-center gap-4">
          <span className={`grid h-11 w-11 shrink-0 place-items-center border ${isLive ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-violet-300/50 bg-violet-300/10 text-violet-200'}`}><Zap className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-[.16em] text-violet-200">{eyebrow}</span><span className="mt-1 block text-lg font-black tracking-[-.04em] text-white">{status?.title ?? 'Mittwoch Showdown'}</span><span className="mt-1 block text-xs text-zinc-400">{config.prize_first} · {config.prize_second} · {config.prize_third}</span></span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-violet-100">Zur Eventwertung <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
      </Link>
    );
  }

  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      <div className="relative overflow-hidden border border-violet-300/25 bg-[linear-gradient(115deg,rgba(109,40,217,.22),rgba(13,17,16,.98)_55%,rgba(10,13,13,1))] p-7 md:p-10">
        <div aria-hidden className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div><p className="inline-flex items-center gap-2 border border-violet-300/30 bg-violet-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.16em] text-violet-100"><span className={`h-2 w-2 rounded-full ${isLive ? 'animate-pulse bg-emerald-300' : 'bg-violet-300'}`} />{eyebrow}</p><h2 className="mt-5 text-4xl font-black tracking-[-.065em] text-white md:text-6xl">{status?.title ?? 'Mittwoch Showdown'}</h2><p className="mt-4 max-w-xl leading-7 text-zinc-300">Vier Stunden Ranked, eine eigene Wochenwertung. Queue- und Turniermatches zählen mit; Elo und Saisonwertung laufen ganz normal weiter.</p></div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1"><div className="border border-amber-300/25 bg-amber-300/[.07] p-4"><Trophy className="h-4 w-4 text-amber-200" /><p className="mt-3 text-[10px] font-black uppercase tracking-[.14em] text-amber-200">1. Platz</p><p className="mt-1 font-black text-white">{config.prize_first}</p></div><div className="border border-violet-300/25 bg-violet-300/[.07] p-4"><CalendarDays className="h-4 w-4 text-violet-200" /><p className="mt-3 text-[10px] font-black uppercase tracking-[.14em] text-violet-200">2. Platz</p><p className="mt-1 font-black text-white">{config.prize_second}</p></div><div className="border border-emerald-300/25 bg-emerald-300/[.07] p-4"><Zap className="h-4 w-4 text-emerald-200" /><p className="mt-3 text-[10px] font-black uppercase tracking-[.14em] text-emerald-200">3. Platz</p><p className="mt-1 font-black text-white">{config.prize_third}</p></div></div>
        </div>
        <div className="relative mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row"><Link href="/showdown" className="inline-flex items-center justify-center gap-2 border border-violet-200 bg-violet-200 px-5 py-3 text-xs font-black uppercase tracking-[.12em] text-violet-950 transition hover:bg-violet-100">Showdown ansehen <ArrowUpRight className="h-4 w-4" /></Link><Link href="/matchmaking" className="inline-flex items-center justify-center gap-2 border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-[.12em] text-zinc-100 transition hover:border-violet-200/50 hover:bg-white/[.04]">Match suchen</Link><p className="self-center text-xs text-zinc-500">Mindestens {status?.minimum_matches ?? 3} bestätigte Matches für die Wertung.</p></div>
      </div>
    </section>
  );
}

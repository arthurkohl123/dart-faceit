'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Info, PartyPopper, TriangleAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type SiteNotice = { id: string; title: string; body: string; tone: 'info' | 'success' | 'warning' | 'event'; href: string | null };

const appearance = {
  info: { icon: Info, wrap: 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-50', iconTone: 'text-cyan-200' },
  success: { icon: PartyPopper, wrap: 'border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-50', iconTone: 'text-emerald-200' },
  warning: { icon: TriangleAlert, wrap: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-50', iconTone: 'text-amber-200' },
  event: { icon: CalendarDays, wrap: 'border-violet-300/20 bg-violet-400/[0.08] text-violet-50', iconTone: 'text-violet-200' },
};

export function SiteNoticeBanner() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const [notice, setNotice] = useState<SiteNotice | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('site_notices').select('id, title, body, tone, href').order('starts_at', { ascending: false }).limit(1);
      const next = (data?.[0] || null) as SiteNotice | null;
      setNotice(next);
      if (next && window.sessionStorage.getItem(`rankeddarts-notice-dismissed:${next.id}`) === '1') setDismissed(next.id);
    };
    void load();
  }, [supabase]);

  if (!notice || dismissed === notice.id || pathname.startsWith('/admin') || pathname.startsWith('/auth')) return null;
  const theme = appearance[notice.tone] || appearance.info;
  const Icon = theme.icon;
  const content = <><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${theme.iconTone}`} /><span className="min-w-0 flex-1"><strong className="block text-xs font-black sm:inline sm:text-sm">{notice.title}</strong>{notice.body && <span className="mt-0.5 block text-xs leading-5 opacity-80 sm:ml-2 sm:inline">{notice.body}</span>}</span>{notice.href && <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-85">Ansehen <ArrowRight className="h-3.5 w-3.5" /></span>}</>;

  return <div className={`fixed inset-x-3 top-3 z-[70] mx-auto max-w-4xl border px-4 py-3 shadow-2xl shadow-black/35 backdrop-blur-xl sm:px-5 ${theme.wrap}`} role="status"><div className="flex items-start gap-3">{notice.href ? <Link href={notice.href} className="flex min-w-0 flex-1 items-start gap-3">{content}</Link> : content}<button onClick={() => { window.sessionStorage.setItem(`rankeddarts-notice-dismissed:${notice.id}`, '1'); setDismissed(notice.id); }} className="shrink-0 text-lg leading-none opacity-50 transition hover:opacity-100" aria-label="Hinweis schließen">×</button></div></div>;
}

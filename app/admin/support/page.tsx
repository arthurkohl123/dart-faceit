'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Headphones, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { LiveSupportAdmin } from '@/components/live-support-admin';

export default function AdminSupportPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login?redirectTo=/admin/support');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('supabaseId', session.user.id)
        .single();

      if (!mounted) return;
      if (!profile?.is_admin) {
        setAccessDenied(true);
        window.setTimeout(() => router.push('/'), 1200);
        return;
      }
      setLoading(false);
    }

    void checkAccess();
    return () => { mounted = false; };
  }, [router, supabase]);

  if (loading || accessDenied) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050607] px-5 text-white">
        <div className="text-center">
          {accessDenied ? <ShieldCheck className="mx-auto h-9 w-9 text-rose-300" /> : <Loader2 className="mx-auto h-9 w-9 animate-spin text-violet-300" />}
          <p className="mt-4 text-sm font-black text-zinc-300">{accessDenied ? 'Kein Admin-Zugriff. Weiterleitung …' : 'Live Support Desk wird vorbereitet …'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] pb-16 text-white">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_12%_8%,rgba(139,92,246,0.22),transparent_30%),radial-gradient(circle_at_88%_14%,rgba(34,211,238,0.13),transparent_27%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_86%)]" />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 pt-5 sm:px-7 sm:pt-8 lg:px-10">
        <header className="overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[#0b0d14]/95 shadow-[0_30px_100px_rgba(0,0,0,0.5)]">
          <div className="border-b border-white/10 bg-gradient-to-r from-violet-400/[0.14] via-transparent to-cyan-400/[0.08] px-5 py-4 sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-black text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Zur Operations-Zentrale</Link>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-100"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> Admin only</span>
            </div>
          </div>
          <div className="px-5 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-violet-200"><Headphones className="h-3.5 w-3.5" /> Spielerhilfe in Echtzeit</div><h1 className="mt-4 text-4xl font-black tracking-[-0.07em] sm:text-5xl">Live Support<br /><span className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-cyan-200 bg-clip-text text-transparent">ohne Admin-Ablenkung.</span></h1><p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">Übernimm Anfragen, antworte direkt im kleinen Chatfenster und bleib als Support-Team verfügbar – getrennt von Turnieren, Disputes und Auszahlungen.</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-violet-300/25 bg-violet-400/10 text-violet-100 shadow-[0_0_30px_rgba(167,139,250,0.15)]"><Headphones className="h-6 w-6" /></div></div>
          </div>
        </header>

        <LiveSupportAdmin />
      </div>
    </main>
  );
}

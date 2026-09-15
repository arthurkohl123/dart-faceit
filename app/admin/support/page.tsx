'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
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
      <main className="grid min-h-screen place-items-center bg-[#0b0f12] px-5 text-[#edf3f1]">
        <div className="w-full max-w-sm border border-[#324047] bg-[#11181c] px-7 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
          {accessDenied ? <ShieldCheck className="mx-auto h-8 w-8 text-[#f08d79]" /> : <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#79d3c4]" />}
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.17em] text-[#aebbb8]">{accessDenied ? 'Kein Admin-Zugriff. Weiterleitung …' : 'Support-Arbeitsplatz wird geladen …'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b0f12] text-[#edf3f1] selection:bg-[#79d3c4] selection:text-[#0b0f12]">
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_8%_0%,rgba(59,115,112,0.20),transparent_33%),radial-gradient(ellipse_at_92%_100%,rgba(26,56,69,0.22),transparent_36%)]">
        <div className="mx-auto max-w-[1640px] px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
          <header className="border border-[#304047] bg-[#10171b] shadow-[0_18px_70px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2c393f] px-4 py-3 sm:px-5">
              <Link href="/admin" className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.09em] text-[#9cadaa] transition hover:text-[#e4efec]"><ArrowLeft className="h-3.5 w-3.5" /> Operations zurück</Link>
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#78918b]"><span className="h-1.5 w-1.5 rounded-full bg-[#79d3c4] shadow-[0_0_12px_rgba(121,211,196,0.8)]" /> Internal service desk</div>
            </div>
            <div className="grid gap-7 px-5 py-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-7 sm:py-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#79d3c4]">RankedDarts · Player Experience</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-[-0.055em] text-[#edf3f1] sm:text-4xl">Support workspace</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#91a19e]">Ein fokussierter Arbeitsplatz für echte Gespräche. Übernimm Anfragen, halte den Status aktuell und löse Probleme, ohne dich durch das Admin-Panel zu arbeiten.</p>
              </div>
              <div className="hidden border-l border-[#33434a] pl-6 sm:block"><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#70827f]">Verbindung</p><p className="mt-1 text-sm font-semibold text-[#d4e1de]">Live support channel</p></div>
            </div>
          </header>

          <LiveSupportAdmin />

          <footer className="flex items-center justify-between px-1 py-5 text-[10px] font-medium uppercase tracking-[0.13em] text-[#526461]"><span>RankedDarts Support Operations</span><span>Private conversations · Admin access</span></footer>
        </div>
      </div>
    </main>
  );
}

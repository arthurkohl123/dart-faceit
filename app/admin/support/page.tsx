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
      <main className="grid min-h-screen place-items-center bg-[#e7e3d9] px-5 text-[#141511]">
        <div className="border-2 border-[#141511] bg-[#f7f4ec] px-8 py-7 text-center shadow-[7px_7px_0_#141511]">
          {accessDenied ? <ShieldCheck className="mx-auto h-9 w-9 text-[#e44c2e]" /> : <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#e44c2e]" />}
          <p className="mt-4 text-sm font-black uppercase tracking-[0.12em]">{accessDenied ? 'Kein Admin-Zugriff. Weiterleitung …' : 'Support Console wird hochgefahren …'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#e7e3d9] text-[#141511] selection:bg-[#f6c453] selection:text-[#141511]">
      <div className="min-h-screen bg-[linear-gradient(rgba(20,21,17,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(20,21,17,0.06)_1px,transparent_1px)] bg-[size:26px_26px]">
        <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <header className="border-2 border-[#141511] bg-[#141511] text-[#f7f4ec] shadow-[8px_8px_0_#e44c2e]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f7f4ec]/25 px-4 py-3 sm:px-5">
              <Link href="/admin" className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-[#f7f4ec]/70 transition hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Zurück zur Zentrale</Link>
              <span className="border border-[#f7f4ec]/35 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6c453]">Interne Konsole · Admin</span>
            </div>
            <div className="grid gap-5 px-5 py-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:px-7 sm:py-9">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#f6c453]">RankedDarts / Player care</p>
                <h1 className="mt-3 text-4xl font-black uppercase leading-[0.84] tracking-[-0.075em] sm:text-6xl">Support<br /><span className="text-[#e44c2e]">Console</span></h1>
                <p className="mt-5 max-w-2xl text-sm leading-6 text-[#f7f4ec]/65">Ein ruhiger Arbeitsraum für Anfragen, Gespräche und Verfügbarkeit. Kein Dashboard, keine Ablenkung – nur der direkte Draht zu den Spielern.</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center border-2 border-[#f7f4ec] bg-[#f6c453] text-[#141511] shadow-[5px_5px_0_#e44c2e]"><Headphones className="h-9 w-9" /></div>
            </div>
          </header>

          <LiveSupportAdmin />
        </div>
      </div>
    </main>
  );
}

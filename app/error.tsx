'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { reportClientError } from '@/lib/client-monitoring';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError('client_runtime_error', error.message, {
      digest: error.digest ?? null,
      path: window.location.pathname,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050507] px-6 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/[0.07] p-8 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 text-red-200"><AlertTriangle className="h-6 w-6" /></div>
        <div className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-red-200">Fehler wurde automatisch gemeldet</div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.05em]">Die Arena ist kurz ins Stolpern geraten.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Der technische Fehler wurde in der Developer-Zentrale gespeichert. Du kannst die Ansicht sicher erneut laden.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-zinc-200"><RefreshCcw className="h-4 w-4" /> Erneut versuchen</button>
          <Link href="/" className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.09]">Zur Startseite</Link>
        </div>
      </section>
    </main>
  );
}


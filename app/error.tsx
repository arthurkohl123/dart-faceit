'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { reportClientError } from '@/lib/client-monitoring';
import { getChunkRecoveryUrl, isChunkLoadError } from '@/lib/client-error-recovery';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkLoadError = isChunkLoadError(error);

  useEffect(() => {
    reportClientError(chunkLoadError ? 'client_chunk_load_error' : 'client_runtime_error', error.message, {
      digest: error.digest ?? null,
      path: window.location.pathname,
      automaticRecovery: chunkLoadError,
    });

    // After a deployment, a tab that has been open for a while can still try
    // to import a removed hashed chunk. Request the current document once so
    // it receives the current chunk manifest. The short guard prevents reload
    // loops if the user's connection is genuinely unavailable.
    if (!chunkLoadError) return;
    const recoveryKey = `rankeddarts:chunk-recovery:${error.message}`;
    const lastAttempt = Number(window.sessionStorage.getItem(recoveryKey) ?? 0);
    if (Date.now() - lastAttempt < 60_000) return;

    window.sessionStorage.setItem(recoveryKey, String(Date.now()));
    const timeoutId = window.setTimeout(() => {
      window.location.replace(getChunkRecoveryUrl(window.location.href));
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [chunkLoadError, error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050507] px-6 text-white">
      <section className="w-full max-w-xl rounded-[2rem] border border-red-300/20 bg-red-500/[0.07] p-8 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 text-red-200"><AlertTriangle className="h-6 w-6" /></div>
        <div className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-red-200">{chunkLoadError ? 'Ansicht wird aktualisiert' : 'Fehler wurde automatisch gemeldet'}</div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.05em]">{chunkLoadError ? 'Es gibt eine neue Version der Arena.' : 'Die Arena ist kurz ins Stolpern geraten.'}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{chunkLoadError ? 'Die Seite lädt automatisch die aktuelle Version. Falls das nicht klappt, aktualisiere die Ansicht bitte einmal manuell.' : 'Der technische Fehler wurde in der Developer-Zentrale gespeichert. Du kannst die Ansicht sicher erneut laden.'}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-zinc-200"><RefreshCcw className="h-4 w-4" /> Erneut versuchen</button>
          <Link href="/" className="rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.09]">Zur Startseite</Link>
        </div>
      </section>
    </main>
  );
}

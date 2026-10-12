import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] px-6 text-white">
      <section className="max-w-md border border-emerald-300/20 bg-[#0d1110] p-8 text-center shadow-2xl shadow-black/40">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">RankedDarts offline</p>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.05em]">Keine Verbindung</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Die App konnte den Server gerade nicht erreichen. Prüfe deine Verbindung und versuche es erneut.</p>
        <Link href="/" className="mt-6 inline-flex bg-emerald-300 px-5 py-3 text-sm font-black text-black">Erneut versuchen</Link>
      </section>
    </main>
  );
}

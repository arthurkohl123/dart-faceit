'use client';

import Link from 'next/link';

export default function Banned() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050607] text-white px-4">
      <div className="max-w-md w-full rounded-[2rem] border border-red-500/20 bg-red-500/[0.06] p-10 text-center backdrop-blur-xl">
        <div className="mb-6 grid h-20 w-20 mx-auto place-items-center rounded-3xl border border-red-400/25 bg-red-500/10 text-4xl">
          🚫
        </div>
        <h1 className="text-3xl font-black tracking-[-0.05em] text-red-300">Account gesperrt</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-400">
          Dein Account wurde von einem Administrator gesperrt. Falls du glaubst, dass dies ein Fehler ist, wende dich bitte an den Support.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-zinc-300 transition hover:border-white/30 hover:bg-white/10"
        >
          Zurück zur Startseite
        </Link>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { Ban } from 'lucide-react';

export default function Banned() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.18),transparent_34%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_84%)]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-[2rem] border border-red-400/25 bg-red-500/10 text-red-300 shadow-[0_0_60px_rgba(239,68,68,0.18)]">
          <Ban className="h-12 w-12" />
        </div>

        <h1 className="mt-8 text-5xl font-black tracking-[-0.06em] md:text-6xl">Account gesperrt</h1>
        <p className="mt-5 max-w-md text-lg leading-8 text-zinc-400">
          Dein Account wurde wegen eines Verstoßes gegen die Community-Regeln dauerhaft gesperrt. Du kannst dich nicht mehr einloggen.
        </p>

        <div className="mt-8 rounded-[1.75rem] border border-red-400/20 bg-red-500/[0.07] px-8 py-5 text-sm leading-7 text-red-200">
          Wenn du glaubst, dass dies ein Fehler ist, wende dich an den Support.
        </div>

        <Link
          href="/"
          className="mt-10 rounded-full border border-white/15 px-8 py-3 text-sm font-bold text-zinc-300 transition hover:border-white/30 hover:bg-white/10"
        >
          Zurück zur Startseite
        </Link>
      </div>
    </main>
  );
}

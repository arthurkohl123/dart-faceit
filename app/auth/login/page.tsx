'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) alert('Fehler: ' + error.message);
    else router.push('/profile');

    setLoading(false);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(6,182,212,0.15),transparent_30%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_84%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-12 md:px-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden lg:block">
          <Link href="/" className="mb-12 inline-flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-2xl font-black tracking-[-0.04em]">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Competitive Darts</div>
            </div>
          </Link>

          <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl">
            <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">Weiter in deine Season</div>
            <h1 className="mt-7 text-6xl font-black leading-[0.9] tracking-[-0.07em]">Zurück in die Queue.</h1>
            <p className="mt-6 text-lg leading-8 text-zinc-300">Melde dich an, prüfe dein Profil, starte ein neues Ranked Match und arbeite weiter an deinem Elo.</p>

            <div className="mt-10 grid gap-4">
              {['Elo-Fortschritt ansehen', 'Matchmaking direkt starten', 'Leaderboard verfolgen'].map((item) => (
                <div key={item} className="flex items-center gap-4 rounded-3xl border border-white/10 bg-black/25 p-4">
                  <div className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
                  <span className="font-semibold text-zinc-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center justify-center gap-3 lg:hidden">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400 text-xl font-black text-black">R</div>
            <span className="text-2xl font-black tracking-[-0.04em]">RANKEDDARTS</span>
          </Link>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
            <div className="mb-8 text-center">
              <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">Login</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.05em]">Willkommen zurück</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Logge dich mit deiner E-Mail und deinem Passwort ein.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">E-Mail</span>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">Passwort</span>
                <input
                  type="password"
                  placeholder="Dein Passwort"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Einloggen...' : 'Einloggen'}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-zinc-400">
              Noch kein Account?{' '}
              <Link href="/auth/register" className="font-bold text-emerald-300 transition hover:text-emerald-200">
                Kostenlos registrieren
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

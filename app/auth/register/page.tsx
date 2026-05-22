'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const normalizePhoneNumber = (value: string) => value.replace(/[\s()-]/g, '');

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const normalizedPhoneNumber = useMemo(() => normalizePhoneNumber(phoneNumber), [phoneNumber]);
  const phoneNumberIsValid = /^\+[1-9]\d{7,14}$/.test(normalizedPhoneNumber);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phoneNumberIsValid) {
      alert('Bitte gib deine Handynummer im internationalen Format ein, zum Beispiel +491701234567.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          phone_number: normalizedPhoneNumber,
          phone_verified: false,
        },
      },
    });

    if (error) {
      alert('Fehler: ' + error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      await supabase.from('profiles').insert({
        supabaseId: data.user.id,
        username,
        elo: 1000,
        gamesPlayed: 0,
        wins: 0,
      });

      await supabase
        .from('profiles')
        .update({
          phone_number: normalizedPhoneNumber,
          phone_verified: false,
          phone_verified_at: null,
        })
        .eq('supabaseId', data.user.id);

      alert('Registrierung erfolgreich! Bestätige jetzt deine Handynummer, damit dein Ranked-Profil verifiziert wird.');
      router.push(`/auth/verify-phone?phone=${encodeURIComponent(normalizedPhoneNumber)}`);
    }

    setLoading(false);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.14),transparent_30%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_82%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-12 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <Link href="/" className="mb-12 inline-flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-2xl font-black tracking-[-0.04em]">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Verified Competitive Darts</div>
            </div>
          </Link>

          <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl">
            <div className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">Anti-Smurf Verifizierung</div>
            <h1 className="mt-7 text-6xl font-black leading-[0.9] tracking-[-0.07em]">Erstelle dein verifiziertes Ranked-Profil.</h1>
            <p className="mt-6 text-lg leading-8 text-zinc-300">Dein Account startet mit 1000 Elo. Die Handynummer-Verifizierung macht RankedDarts fairer, weil Multiaccounts und Fake-Profile deutlich schwerer werden.</p>

            <div className="mt-10 grid gap-4">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/[0.06] p-6">
                <div className="text-sm font-black uppercase tracking-[0.25em] text-emerald-300">Verifizierungsflow</div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-black/25 p-4">
                    <div className="text-3xl font-black">1</div>
                    <div className="text-xs text-zinc-400">Account</div>
                  </div>
                  <div className="rounded-2xl bg-black/25 p-4">
                    <div className="text-3xl font-black">2</div>
                    <div className="text-xs text-zinc-400">SMS-Code</div>
                  </div>
                  <div className="rounded-2xl bg-black/25 p-4">
                    <div className="text-3xl font-black">3</div>
                    <div className="text-xs text-zinc-400">Ranked frei</div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm leading-6 text-zinc-400">
                Deine Nummer wird nicht öffentlich angezeigt. Sie dient nur der Account-Verifizierung und späteren Fair-Play-Prüfung.
              </div>
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
              <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">Registrierung</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.05em]">Kostenlos starten</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Wähle deinen Spielernamen und hinterlege deine Handynummer für die anschließende SMS-Verifizierung.</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">Benutzername</span>
                <input
                  type="text"
                  placeholder="CheckoutKing"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                  required
                />
              </label>

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
                <span className="mb-2 block text-sm font-bold text-zinc-300">Handynummer</span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="+491701234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                  required
                />
                <span className={`mt-2 block text-xs ${phoneNumber && !phoneNumberIsValid ? 'text-amber-300' : 'text-zinc-500'}`}>Bitte im internationalen Format eintragen, zum Beispiel +49...</span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">Passwort</span>
                <input
                  type="password"
                  placeholder="Mindestens 6 Zeichen"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading || !phoneNumberIsValid}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Wird erstellt...' : 'Account erstellen'}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-zinc-400">
              Schon registriert?{' '}
              <Link href="/auth/login" className="font-bold text-emerald-300 transition hover:text-emerald-200">
                Zum Login
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

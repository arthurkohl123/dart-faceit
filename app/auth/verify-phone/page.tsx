'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, LockKeyhole, MessageSquareCode, Phone, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

const normalizePhoneNumber = (value: string) => value.replace(/[\s()-]/g, '');

export default function VerifyPhone() {
  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('phone') || '';
  });
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const normalizedPhoneNumber = useMemo(() => normalizePhoneNumber(phoneNumber), [phoneNumber]);
  const phoneNumberIsValid = /^\+[1-9]\d{7,14}$/.test(normalizedPhoneNumber);
  const codeIsValid = /^\d{6}$/.test(code.trim());

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsLoggedIn(Boolean(data.session));

      if (data.session?.user.phone_confirmed_at) {
        setVerified(true);
        setMessage('Deine Handynummer ist bereits verifiziert.');
      }
    };

    void checkSession();
  }, [supabase]);

  const sendVerificationCode = async () => {
    setErrorMessage('');
    setMessage('');

    if (!phoneNumberIsValid) {
      setErrorMessage('Bitte gib deine Handynummer im internationalen Format ein, zum Beispiel +491701234567.');
      return;
    }

    setSending(true);

    const { error } = await supabase.auth.updateUser({
      phone: normalizedPhoneNumber,
    });

    if (error) {
      setErrorMessage(`SMS-Code konnte nicht gesendet werden: ${error.message}`);
    } else {
      setMessage('SMS-Code wurde gesendet. Bitte prüfe dein Handy und gib den 6-stelligen Code ein.');
    }

    setSending(false);
  };

  const verifyCode = async () => {
    setErrorMessage('');
    setMessage('');

    if (!phoneNumberIsValid || !codeIsValid) {
      setErrorMessage('Bitte gib eine gültige Handynummer und den 6-stelligen SMS-Code ein.');
      return;
    }

    setVerifying(true);

    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizedPhoneNumber,
      token: code.trim(),
      type: 'phone_change',
    });

    if (error) {
      setErrorMessage(`Code konnte nicht bestätigt werden: ${error.message}`);
      setVerifying(false);
      return;
    }

    const userId = data.user?.id;

    if (userId) {
      await supabase
        .from('profiles')
        .update({
          phone_number: normalizedPhoneNumber,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
        })
        .eq('supabaseId', userId);
    }

    setVerified(true);
    setMessage('Telefonnummer erfolgreich verifiziert. Dein Ranked-Profil ist bereit.');
    setVerifying(false);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_12%,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_82%_6%,rgba(6,182,212,0.15),transparent_30%),radial-gradient(circle_at_48%_78%,rgba(163,230,53,0.1),transparent_34%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_82%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="relative z-10 border-b border-white/10 bg-black/45 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400 to-lime-300 text-xl font-black text-black shadow-[0_0_35px_rgba(34,197,94,0.35)]">R</div>
            <div>
              <div className="text-xl font-black tracking-[-0.04em] md:text-2xl">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Phone Verification</div>
            </div>
          </Link>

          <Link href="/profile" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10">
            Zum Profil
          </Link>
        </div>
      </nav>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-88px)] max-w-6xl items-center gap-10 px-5 py-14 md:px-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_20px_rgba(110,231,183,0.8)]" />
            Fair-Play Schutz
          </div>
          <h1 className="mt-6 text-6xl font-black leading-[0.88] tracking-[-0.07em] md:text-8xl">Verifiziere dein Ranked-Profil.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">Die Handynummer-Verifizierung schützt die Ladder vor Multiaccounts, Fake-Profilen und unfairen Ranked-Vorteilen. Deine Nummer wird nicht öffentlich angezeigt.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <Phone className="h-6 w-6 text-emerald-300" />
              <div className="mt-4 text-xl font-black">Nummer</div>
              <div className="mt-1 text-sm text-zinc-500">E.164 Format</div>
            </div>
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <MessageSquareCode className="h-6 w-6 text-cyan-300" />
              <div className="mt-4 text-xl font-black">SMS-Code</div>
              <div className="mt-1 text-sm text-zinc-500">6 Stellen</div>
            </div>
            <div className="rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <ShieldCheck className="h-6 w-6 text-lime-300" />
              <div className="mt-4 text-xl font-black">Ranked</div>
              <div className="mt-1 text-sm text-zinc-500">Verifiziert</div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-950/86 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />

          <div className="relative">
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_45px_rgba(34,197,94,0.18)]">
              {verified ? <CheckCircle2 className="h-12 w-12" /> : <LockKeyhole className="h-12 w-12" />}
            </div>

            <div className="mt-8 text-center">
              <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">SMS-Verifizierung</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.05em]">Handynummer bestätigen</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">Sende dir einen Code per SMS und bestätige ihn auf dieser Seite. Danach kann dein Profil als telefonisch verifiziert markiert werden.</p>
            </div>

            {isLoggedIn === false && (
              <div className="mt-7 rounded-3xl border border-amber-300/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
                Du musst eingeloggt sein, um deine Telefonnummer mit deinem Account zu verknüpfen. Bitte melde dich an und öffne diese Seite danach erneut.
                <Link href="/auth/login" className="mt-4 block font-black text-amber-50 underline underline-offset-4">Zum Login</Link>
              </div>
            )}

            {message && <div className="mt-7 rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-5 text-sm font-semibold leading-6 text-emerald-100">{message}</div>}
            {errorMessage && <div className="mt-7 rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm font-semibold leading-6 text-red-100">{errorMessage}</div>}

            <div className="mt-8 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">Handynummer</span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="+491701234567"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  disabled={verified || isLoggedIn === false}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className={`mt-2 block text-xs ${phoneNumber && !phoneNumberIsValid ? 'text-amber-300' : 'text-zinc-500'}`}>Format: +49..., ohne führende 0 nach der Landesvorwahl.</span>
              </label>

              <button
                onClick={sendVerificationCode}
                disabled={sending || verified || !phoneNumberIsValid || isLoggedIn !== true}
                className="w-full rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-6 py-4 font-black uppercase tracking-[0.16em] text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? 'SMS wird gesendet...' : 'SMS-Code senden'}
              </button>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">6-stelliger Code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={verified || isLoggedIn === false}
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-2xl font-black tracking-[0.4em] text-white outline-none transition placeholder:text-zinc-700 focus:border-emerald-300/60 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <button
                onClick={verifyCode}
                disabled={verifying || verified || !phoneNumberIsValid || !codeIsValid || isLoggedIn !== true}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifying ? 'Code wird geprüft...' : verified ? 'Verifiziert' : 'Code bestätigen'}
              </button>
            </div>

            {verified && (
              <button onClick={() => router.push('/profile')} className="mt-6 w-full rounded-2xl border border-white/15 px-6 py-4 font-bold text-zinc-200 transition hover:border-white/35 hover:bg-white/10">
                Zurück zum Profil
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

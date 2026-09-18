'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { verifyCaptcha } from '@/lib/captcha-client';
import { BrandLogo } from '@/components/BrandLogo';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail } from 'lucide-react';

// ─── Innere Komponente (nutzt useSearchParams) ────────────────────────────────
// useSearchParams() erfordert ein Suspense-Boundary im App Router.
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormMessage(null);

    const captcha = await verifyCaptcha('login', captchaToken);
    if (!captcha.ok) {
      setFormMessage({ type: 'error', text: captcha.error || 'Sicherheitsprüfung fehlgeschlagen.' });
      setLoading(false);
      return;
    }

    const rateLimitResponse = await fetch('/api/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email }),
    });

    if (!rateLimitResponse.ok) {
      const payload = await rateLimitResponse.json().catch(() => null) as { error?: string } | null;
      setFormMessage({ type: 'error', text: payload?.error || 'Die Sicherheitsprüfung ist gerade nicht verfügbar.' });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setFormMessage({ type: 'error', text: 'Fehler: ' + error.message });
      setLoading(false);
      return;
    }

    // Nach erfolgreichem Login zur ursprünglichen Ziel-URL weiterleiten,
    // falls vorhanden – sonst zum Profil.
    const redirectTo = searchParams.get('redirectTo');
    router.push(redirectTo && redirectTo.startsWith('/') ? redirectTo : '/profile');

    setLoading(false);
  };

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setFormMessage({ type: 'error', text: 'Bitte gib zuerst deine E-Mail-Adresse ein, damit wir dir den Reset-Link senden können.' });
      return;
    }

    setResetLoading(true);
    setFormMessage(null);

    const captcha = await verifyCaptcha('login', captchaToken);
    if (!captcha.ok) {
      setFormMessage({ type: 'error', text: captcha.error || 'Sicherheitsprüfung fehlgeschlagen.' });
      setResetLoading(false);
      return;
    }

    const rateLimitResponse = await fetch('/api/rate-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', email: trimmedEmail }),
    });

    if (!rateLimitResponse.ok) {
      const payload = await rateLimitResponse.json().catch(() => null) as { error?: string } | null;
      setFormMessage({ type: 'error', text: payload?.error || 'Die Sicherheitsprüfung ist gerade nicht verfügbar.' });
      setResetLoading(false);
      return;
    }

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/reset-password`
      : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, { redirectTo });

    if (error) {
      setFormMessage({ type: 'error', text: 'Fehler beim Senden der Passwort-Reset-Mail: ' + error.message });
      setResetLoading(false);
      return;
    }

    setFormMessage({ type: 'success', text: 'Wenn ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen des Passworts gesendet.' });
    setResetLoading(false);
  };

  return (
    <div className="relative border border-white/10 bg-[#0b0e0e] p-5 shadow-[0_28px_90px_rgba(0,0,0,.48)] sm:p-7">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
      <div className="mb-8 border-b border-white/8 pb-6">
        <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Account access / 01</span><span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Sicher</span></div>
        <h2 className="mt-5 text-4xl font-black tracking-[-0.07em] text-white">Willkommen<br />zurück.</h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">Melde dich an und mach genau dort weiter, wo dein letztes Match aufgehört hat.</p>
      </div>

      {formMessage && (
        <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${
          formMessage.type === 'error'
            ? 'border-red-400/25 bg-red-500/10 text-red-100'
            : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
        }`}>
          {formMessage.text}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-zinc-300">E-Mail</span>
          <span className="relative block"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-white/10 bg-black/25 py-4 pl-11 pr-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-emerald-400/[0.04]"
            required
          /></span>
        </label>

        <label className="block">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="block text-sm font-bold text-zinc-300">Passwort</span>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetLoading || loading}
              className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300 transition hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetLoading ? 'Wird gesendet...' : 'Passwort vergessen?'}
            </button>
          </div>
          <span className="relative block"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input
            type="password"
            placeholder="Dein Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-white/10 bg-black/25 py-4 pl-11 pr-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-emerald-400/[0.04]"
            required
          /></span>
      </label>

      <TurnstileWidget action="login" onToken={setCaptchaToken} />

      <button
          type="submit"
          disabled={loading || resetLoading}
          className="group flex w-full items-center justify-center gap-2 bg-emerald-300 px-6 py-4 font-black uppercase tracking-[0.18em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Einloggen...' : <>Einloggen <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></>}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600"><span>Season 01 · bis 01.11.2026</span><span className="h-1 w-1 rounded-full bg-zinc-700" /><span>Secure access</span></div>
      <p className="mt-4 text-center text-sm text-zinc-400">
        Noch kein Account?{' '}
        <Link href="/auth/register" className="font-bold text-emerald-300 transition hover:text-emerald-200">
          Kostenlos registrieren
        </Link>
      </p>
    </div>
  );
}

// ─── Seiten-Komponente ────────────────────────────────────────────────────────
export default function Login() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070909] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_12%_88%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(ellipse_at_84%_10%,rgba(45,212,191,0.09),transparent_24%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#7bf7bf_1px,transparent_1px),linear-gradient(to_bottom,#7bf7bf_1px,transparent_1px)] [background-size:38px_38px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1.12fr_.88fr] lg:gap-14">
        <section className="hidden lg:block">
          <Link href="/" className="mb-16 inline-flex items-center gap-3">
            <BrandLogo className="h-12 w-12 rounded-xl" />
            <div>
              <div className="text-2xl font-black tracking-[-0.04em]">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Competitive Darts</div>
            </div>
          </Link>

          <div className="max-w-xl">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-300">Deine Ranked-Zentrale</p>
            <h1 className="mt-6 text-7xl font-black leading-[.84] tracking-[-0.09em]">Zurück<br /><span className="text-emerald-300">ans Oche.</span></h1>
            <p className="mt-8 max-w-lg text-lg leading-8 text-zinc-400">Elo, Matches, Turniere und deine nächsten Gegner – alles wartet dort, wo du aufgehört hast.</p>
            <div className="mt-12 grid grid-cols-[auto_1fr] gap-x-5 gap-y-5 border-l border-emerald-300/25 pl-5">
              {['Matchmaking öffnet direkt deine zuletzt gewählte Plattform.', 'Offene Ergebnisse und Turnier-Check-ins verpasst du nicht mehr.', 'Dein Profil, Elo und Match-Historie bleiben an einem Ort.'].map((item, index) => (
                <div key={item} className="contents"><span className="grid h-7 w-7 place-items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-xs font-black text-emerald-200">0{index + 1}</span><span className="pt-1 text-sm font-semibold leading-5 text-zinc-300">{item}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <ArrowLeft className="h-4 w-4 text-zinc-500" /><BrandLogo className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-black tracking-[-0.04em]">RANKEDDARTS</span>
          </Link>

          {/* Suspense-Boundary für useSearchParams() */}
          <Suspense fallback={
            <div className="rounded-[2rem] border border-white/10 bg-zinc-950/85 p-8 text-center text-zinc-400 backdrop-blur-2xl">
              Wird geladen...
            </div>
          }>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

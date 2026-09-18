'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { TurnstileWidget } from '@/components/turnstile-widget';
import { verifyCaptcha } from '@/lib/captcha-client';
import { BrandLogo } from '@/components/BrandLogo';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, ShieldCheck, Smartphone, UserRound } from 'lucide-react';

const normalizePhoneNumber = (value: string) => value.replace(/[\s()-]/g, '');

const EMPTY_SUPABASE_ERROR_MESSAGE = 'Supabase hat nur ein leeres Fehlerobjekt zurückgegeben. Das passiert häufig, wenn die E-Mail-Bestätigung aktiv ist, aber SMTP-Absender, SMTP-Zugangsdaten oder Redirect-URL in Supabase nicht korrekt konfiguriert sind. Bitte prüfe Auth → Logs in Supabase und die SMTP-Einstellungen.';

const normalizeErrorText = (value: unknown) => {
  if (typeof value !== 'string') return '';

  const text = value.trim();
  if (!text || text === '{}' || text === '[]' || text === '[object Object]') return '';

  return text;
};

const getReadableAuthError = (error: unknown) => {
  if (!error) return EMPTY_SUPABASE_ERROR_MESSAGE;

  const directString = normalizeErrorText(error);
  if (directString) return directString;

  if (error instanceof Error) {
    const message = normalizeErrorText(error.message);
    if (message) return message;
  }

  if (typeof error === 'object') {
    const maybeError = error as {
      message?: unknown;
      error_description?: unknown;
      error?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      status?: unknown;
      name?: unknown;
    };

    const parts = [
      maybeError.message,
      maybeError.error_description,
      maybeError.error,
      maybeError.details,
      maybeError.hint,
      maybeError.code ? `Code: ${String(maybeError.code)}` : '',
      maybeError.status ? `Status: ${String(maybeError.status)}` : '',
      maybeError.name ? `Typ: ${String(maybeError.name)}` : '',
    ]
      .map(normalizeErrorText)
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }

  return EMPTY_SUPABASE_ERROR_MESSAGE;
};

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsVerificationEnabled, setSmsVerificationEnabled] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const trimmedEmail = email.trim();
  const trimmedUsername = username.trim();
  const normalizedPhoneNumber = useMemo(() => normalizePhoneNumber(phoneNumber), [phoneNumber]);
  const phoneNumberIsValid = /^\+[1-9]\d{7,14}$/.test(normalizedPhoneNumber);
  const canSubmit = (!smsVerificationEnabled || phoneNumberIsValid) && termsAccepted && ageConfirmed;

  useEffect(() => {
    const loadSmsSetting = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'sms_verification')
        .maybeSingle();

      setSmsVerificationEnabled((data?.value as { enabled?: boolean } | null)?.enabled !== false);
    };

    void loadSmsSetting();
  }, [supabase]);

  const createProfileForActiveSession = async (userId: string) => {
    const profilePayload = {
      supabaseId: userId,
      username: trimmedUsername,
      elo: 1000,
      gamesPlayed: 0,
      wins: 0,
      phone_number: normalizedPhoneNumber || null,
      phone_verified: !smsVerificationEnabled,
      phone_verified_at: smsVerificationEnabled ? null : new Date().toISOString(),
      age_confirmed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'supabaseId' });

    if (error) {
      throw error;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);

    if (!trimmedUsername) {
      setFormMessage({ type: 'error', text: 'Bitte gib einen Benutzernamen ein.' });
      return;
    }

    if (!trimmedEmail) {
      setFormMessage({ type: 'error', text: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
      return;
    }

    if (password.length < 6) {
      setFormMessage({ type: 'error', text: 'Dein Passwort muss mindestens 6 Zeichen lang sein.' });
      return;
    }

    if (smsVerificationEnabled && !phoneNumberIsValid) {
      setFormMessage({ type: 'error', text: 'Bitte gib deine Handynummer im internationalen Format ein, zum Beispiel +491701234567.' });
      return;
    }

    if (!termsAccepted) {
      setFormMessage({ type: 'error', text: 'Bitte akzeptiere die AGB und Turnierregeln, um einen Account zu erstellen.' });
      return;
    }

    if (!ageConfirmed) {
      setFormMessage({ type: 'error', text: 'RankedDarts richtet sich ausschließlich an volljährige Personen. Bitte bestätige, dass du mindestens 18 Jahre alt bist.' });
      return;
    }

    setLoading(true);

    try {
      const captcha = await verifyCaptcha('register', captchaToken);
      if (!captcha.ok) {
        setFormMessage({ type: 'error', text: captcha.error || 'Sicherheitsprüfung fehlgeschlagen.' });
        return;
      }

      // This gives immediate feedback in the normal case. The database's
      // case-insensitive unique index remains the authoritative race-safe
      // protection when two people submit the same name at once.
      const { data: usernameAvailable, error: usernameAvailabilityError } = await supabase.rpc(
        'is_username_available',
        { p_username: trimmedUsername },
      );
      if (!usernameAvailabilityError && !usernameAvailable) {
        setFormMessage({ type: 'error', text: 'Dieser Benutzername ist bereits vergeben. Bitte wähle einen anderen.' });
        return;
      }

      const emailRedirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/login?confirmed=1`
        : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo,
            data: {
            username: trimmedUsername,
            phone_number: normalizedPhoneNumber || null,
              phone_verified: !smsVerificationEnabled,
              terms_accepted: true,
              terms_version: '2026-08-27',
              age_confirmed: true,
              age_confirmed_at: new Date().toISOString(),
            },
        },
      });

      if (error) {
        console.error('Supabase signUp failed', error);
        setFormMessage({ type: 'error', text: `Registrierung fehlgeschlagen: ${getReadableAuthError(error)}` });
        return;
      }

      if (!data.user) {
        setFormMessage({
          type: 'info',
          text: 'Falls die E-Mail-Adresse gültig ist, erhältst du gleich eine Bestätigungs-E-Mail. Bitte prüfe auch deinen Spam-Ordner.',
        });
        return;
      }

      if (!data.session) {
        setFormMessage({
          type: 'success',
          text: 'Registrierung erfolgreich. Bitte bestätige jetzt deine E-Mail-Adresse über den Link, den wir dir gesendet haben. Danach kannst du dich einloggen.',
        });
        setPassword('');
        return;
      }

      await createProfileForActiveSession(data.user.id);

      if (smsVerificationEnabled) {
        setFormMessage({ type: 'success', text: 'Registrierung erfolgreich. Bestätige jetzt deine Handynummer, damit dein Ranked-Profil verifiziert wird.' });
        setTimeout(() => router.push(`/auth/verify-phone?phone=${encodeURIComponent(normalizedPhoneNumber)}`), 1200);
      } else {
        setFormMessage({ type: 'success', text: 'Registrierung erfolgreich. Die SMS-Verifizierung ist aktuell deaktiviert, dein Ranked-Profil ist direkt bereit.' });
        setTimeout(() => router.push('/profile'), 1200);
      }
    } catch (error) {
      console.error('Registration flow failed', error);
      setFormMessage({ type: 'error', text: `Registrierung fehlgeschlagen: ${getReadableAuthError(error)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070909] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_12%_15%,rgba(16,185,129,0.15),transparent_27%),radial-gradient(ellipse_at_88%_88%,rgba(45,212,191,0.10),transparent_26%)]" />
        <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#7bf7bf_1px,transparent_1px),linear-gradient(to_bottom,#7bf7bf_1px,transparent_1px)] [background-size:38px_38px]" />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-7xl items-center gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[1.12fr_.88fr] lg:gap-14">
        <section className="hidden lg:block">
          <Link href="/" className="mb-16 inline-flex items-center gap-3">
            <BrandLogo className="h-12 w-12 rounded-xl" />
            <div>
              <div className="text-2xl font-black tracking-[-0.04em]">RANKEDDARTS</div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-300/80">Verified Competitive Darts</div>
            </div>
          </Link>

          <div className="max-w-xl">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-300">Dein Einstieg ins Ranked</p>
            <h1 className="mt-6 text-7xl font-black leading-[.84] tracking-[-0.09em]">Spiel nicht<br /><span className="text-emerald-300">irgendwo.</span></h1>
            <p className="mt-8 max-w-lg text-lg leading-8 text-zinc-400">Erstelle ein Profil, das wirklich dir gehört. Danach wartet die Queue, das Leaderboard und deine erste Season.</p>
            <div className="mt-12 grid grid-cols-[auto_1fr] gap-x-5 gap-y-5 border-l border-emerald-300/25 pl-5">
              {['Dein Account startet bei 1000 Elo.', 'E-Mail bestätigen, damit dein Zugang sicher dir gehört.', 'Telefon-Verifizierung schützt die Queue vor Multi-Accounts.'].map((item, index) => (
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

          <div className="relative border border-white/10 bg-[#0b0e0e] p-5 shadow-[0_28px_90px_rgba(0,0,0,.48)] sm:p-7">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
            <div className="mb-8 border-b border-white/8 pb-6">
              <div className="flex items-center justify-between gap-4"><span className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Account setup / 01</span><span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Fair play</span></div>
              <h2 className="mt-5 text-4xl font-black tracking-[-0.07em] text-white">Dein neues<br />Spielerprofil.</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Wähle deinen Namen{smsVerificationEnabled ? ' und hinterlege deine Nummer für den sicheren Ranked-Zugang.' : '. Die SMS-Verifizierung ist aktuell deaktiviert.'}</p>
            </div>

            {formMessage && (
              <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-semibold leading-6 ${
                formMessage.type === 'error'
                  ? 'border-red-400/25 bg-red-500/10 text-red-100'
                  : formMessage.type === 'info'
                    ? 'border-sky-300/25 bg-sky-400/10 text-sky-100'
                    : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
              }`}>
                {formMessage.text}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">Benutzername</span>
                <span className="relative block"><UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input
                  type="text"
                  placeholder="CheckoutKing"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-white/10 bg-black/25 py-4 pl-11 pr-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-emerald-400/[0.04]"
                  required
                /></span>
              </label>

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
                <span className="mb-2 block text-sm font-bold text-zinc-300">Handynummer</span>
                <span className="relative block"><Smartphone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input
                  type="tel"
                  inputMode="tel"
                  placeholder="+491701234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full border border-white/10 bg-black/25 py-4 pl-11 pr-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-emerald-400/[0.04]"
                  required={smsVerificationEnabled}
                /></span>
                <span className={`mt-2 block text-xs ${phoneNumber && !phoneNumberIsValid ? 'text-amber-300' : 'text-zinc-500'}`}>{smsVerificationEnabled ? 'Bitte im internationalen Format eintragen, zum Beispiel +49...' : 'Optional, solange die SMS-Verifizierung deaktiviert ist.'}</span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-zinc-300">Passwort</span>
                <span className="relative block"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input
                  type="password"
                  placeholder="Mindestens 6 Zeichen"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-white/10 bg-black/25 py-4 pl-11 pr-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-emerald-400/[0.04]"
                  required
                /></span>
              </label>

              <TurnstileWidget action="register" onToken={setCaptchaToken} />

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-zinc-400">
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" />
                <span>Ich akzeptiere die <Link href="/agb" target="_blank" className="font-bold text-emerald-300 underline-offset-2 hover:underline">AGB</Link> und die <Link href="/turnierregeln" target="_blank" className="font-bold text-emerald-300 underline-offset-2 hover:underline">Turnierregeln</Link>.</span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-sm leading-6 text-zinc-300">
                <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" />
                <span>Ich bestätige, dass ich mindestens 18 Jahre alt bin. RankedDarts ist ausschließlich für volljährige Personen bestimmt.</span>
              </label>

              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="group flex w-full items-center justify-center gap-2 bg-emerald-300 px-6 py-4 font-black uppercase tracking-[0.18em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Wird erstellt...' : <>Account erstellen <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></>}
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

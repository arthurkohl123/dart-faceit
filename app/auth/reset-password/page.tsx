'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);

    if (password.length < 6) {
      setFormMessage({ type: 'error', text: 'Das neue Passwort muss mindestens 6 Zeichen lang sein.' });
      return;
    }

    if (password !== confirmPassword) {
      setFormMessage({ type: 'error', text: 'Die beiden Passwörter stimmen nicht überein.' });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setFormMessage({ type: 'error', text: 'Fehler beim Aktualisieren des Passworts: ' + error.message });
      setLoading(false);
      return;
    }

    setFormMessage({ type: 'success', text: 'Dein Passwort wurde erfolgreich geändert. Du wirst gleich zum Login weitergeleitet.' });
    setPassword('');
    setConfirmPassword('');
    setLoading(false);

    window.setTimeout(() => router.push('/auth/login'), 1800);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.24),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(6,182,212,0.15),transparent_30%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_84%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12 md:px-8">
        <Link href="/" className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400 text-xl font-black text-black">R</div>
          <span className="text-2xl font-black tracking-[-0.04em]">RANKEDDARTS</span>
        </Link>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/85 p-6 shadow-2xl shadow-black/60 backdrop-blur-2xl md:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
          <div className="mb-8 text-center">
            <div className="text-sm font-black uppercase tracking-[0.3em] text-emerald-300">Passwort zurücksetzen</div>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em]">Neues Passwort setzen</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Gib ein neues Passwort für deinen Account ein. Diese Seite funktioniert, nachdem du den Link aus der Reset-Mail geöffnet hast.
            </p>
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

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-zinc-300">Neues Passwort</span>
              <input
                type="password"
                placeholder="Mindestens 6 Zeichen"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-zinc-300">Passwort bestätigen</span>
              <input
                type="password"
                placeholder="Passwort wiederholen"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.07]"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-400 px-6 py-4 font-black uppercase tracking-[0.18em] text-black shadow-[0_18px_60px_rgba(34,197,94,0.24)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Wird gespeichert...' : 'Passwort aktualisieren'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-zinc-400">
            Zurück zum{' '}
            <Link href="/auth/login" className="font-bold text-emerald-300 transition hover:text-emerald-200">
              Login
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
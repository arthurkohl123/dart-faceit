'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Notice = { type: 'success' | 'error'; text: string } | null;

const inputClassName = 'mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-300/60 focus:bg-white/[0.05]';

export default function AccountSettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [emailNotice, setEmailNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentEmail(data.user?.email ?? null);
      setNewEmail(data.user?.email ?? '');
    });
  }, [supabase]);

  const updateEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailNotice(null);
    const email = newEmail.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      setEmailNotice({ type: 'error', text: 'Bitte gib eine gültige E-Mail-Adresse ein.' });
      return;
    }
    if (email === currentEmail?.toLowerCase()) {
      setEmailNotice({ type: 'error', text: 'Das ist bereits deine aktuelle E-Mail-Adresse.' });
      return;
    }

    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email });
    setEmailSaving(false);

    if (error) {
      setEmailNotice({ type: 'error', text: `E-Mail konnte nicht geändert werden: ${error.message}` });
      return;
    }
    setEmailNotice({ type: 'success', text: 'Wir haben dir einen Bestätigungslink an die neue E-Mail-Adresse geschickt. Erst nach der Bestätigung wird die Änderung aktiv.' });
  };

  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordNotice(null);

    if (password.length < 6) {
      setPasswordNotice({ type: 'error', text: 'Dein neues Passwort muss mindestens 6 Zeichen lang sein.' });
      return;
    }
    if (password !== passwordConfirmation) {
      setPasswordNotice({ type: 'error', text: 'Die beiden Passwörter stimmen nicht überein.' });
      return;
    }

    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordSaving(false);

    if (error) {
      setPasswordNotice({ type: 'error', text: `Passwort konnte nicht geändert werden: ${error.message}` });
      return;
    }
    setPassword('');
    setPasswordConfirmation('');
    setPasswordNotice({ type: 'success', text: 'Dein Passwort wurde erfolgreich aktualisiert.' });
  };

  return (
    <main className="min-h-screen bg-[#050607] px-5 py-12 text-white sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/account" className="text-sm font-bold text-zinc-500 transition hover:text-white">← Zur Konto-Zentrale</Link>
        <header className="mt-6 rounded-[2rem] border border-emerald-300/15 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.13),transparent_48%),rgba(9,9,11,0.84)] p-6 shadow-2xl shadow-black/35 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100"><ShieldCheck className="h-3.5 w-3.5" /> Account security</div>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Einstellungen & Sicherheit</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Ändere die Zugangsdaten deines RankedDarts-Accounts sicher an einem Ort.</p>
        </header>

        <section className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200"><Mail className="h-5 w-5" /></span><div><h2 className="font-black text-white">E-Mail-Adresse ändern</h2><p className="mt-1 text-sm leading-5 text-zinc-500">Aktuell: {currentEmail ?? 'Wird geladen …'}</p></div></div>
          <form onSubmit={(event) => void updateEmail(event)} className="mt-5">
            <label className="block text-sm font-bold text-zinc-300">Neue E-Mail-Adresse<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} autoComplete="email" className={inputClassName} required /></label>
            {emailNotice && <NoticeBox notice={emailNotice} />}
            <button type="submit" disabled={emailSaving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-black transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60">{emailSaving && <Loader2 className="h-4 w-4 animate-spin" />}{emailSaving ? 'Wird vorbereitet …' : 'E-Mail ändern'}</button>
          </form>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><KeyRound className="h-5 w-5" /></span><div><h2 className="font-black text-white">Passwort ändern</h2><p className="mt-1 text-sm leading-5 text-zinc-500">Wähle ein Passwort, das du nur für RankedDarts verwendest.</p></div></div>
          <form onSubmit={(event) => void updatePassword(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-bold text-zinc-300">Neues Passwort<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Mindestens 6 Zeichen" className={inputClassName} required /></label>
            <label className="block text-sm font-bold text-zinc-300">Passwort wiederholen<input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" className={inputClassName} required /></label>
            <div className="sm:col-span-2">{passwordNotice && <NoticeBox notice={passwordNotice} />}<button type="submit" disabled={passwordSaving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60">{passwordSaving && <Loader2 className="h-4 w-4 animate-spin" />}{passwordSaving ? 'Wird gespeichert …' : 'Passwort aktualisieren'}</button></div>
          </form>
        </section>
      </div>
    </main>
  );
}

function NoticeBox({ notice }: { notice: NonNullable<Notice> }) {
  const isSuccess = notice.type === 'success';
  return <p className={`mt-4 flex gap-2 rounded-xl border px-3 py-3 text-sm leading-5 ${isSuccess ? 'border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-100' : 'border-rose-300/20 bg-rose-400/[0.08] text-rose-100'}`}>{isSuccess && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{notice.text}</p>;
}

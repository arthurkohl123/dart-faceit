'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, Landmark, Loader2, LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Payout = {
  id: string;
  source_label: string;
  amount_cents: number;
  currency: 'EUR';
  status: 'open' | 'details_requested' | 'ready' | 'paid' | 'on_hold' | 'cancelled';
  due_at: string | null;
  paid_at: string | null;
  payment_method: 'bank_transfer' | 'paypal' | null;
  details_submitted_at: string | null;
  age_confirmed_at: string | null;
};

const statusCopy: Record<Payout['status'], { label: string; className: string; description: string }> = {
  open: { label: 'In Prüfung', className: 'border-amber-300/25 bg-amber-300/10 text-amber-100', description: 'Die Auszahlung wird gerade vorbereitet.' },
  details_requested: { label: 'Daten benötigt', className: 'border-violet-300/25 bg-violet-400/10 text-violet-100', description: 'Bitte wähle deinen Zahlungsweg und hinterlege die nötigen Daten.' },
  ready: { label: 'Auszahlung bereit', className: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100', description: 'Deine Angaben liegen vor und die Auszahlung wird manuell ausgeführt.' },
  paid: { label: 'Ausgezahlt', className: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100', description: 'Die Auszahlung wurde dokumentiert.' },
  on_hold: { label: 'Rückfrage offen', className: 'border-rose-300/25 bg-rose-400/10 text-rose-100', description: 'Bitte warte auf eine Nachricht des Support-Teams.' },
  cancelled: { label: 'Nicht verfügbar', className: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-300', description: 'Diese Auszahlung wurde geschlossen.' },
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(value)) : '—';
}

export default function PayoutsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'paypal'>('bank_transfer');
  const [accountHolder, setAccountHolder] = useState('');
  const [iban, setIban] = useState('');
  const [paypalEmail, setPaypalEmail] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPayouts = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_payouts');
    if (error) {
      setMessage({ type: 'error', text: 'Deine Auszahlungen konnten gerade nicht geladen werden.' });
      setLoading(false);
      return;
    }
    setPayouts((data || []) as Payout[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadPayouts(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadPayouts]);

  const submitDetails = async (payout: Payout) => {
    if (!ageConfirmed) {
      setMessage({ type: 'error', text: 'Bitte bestätige zuerst, dass du mindestens 18 Jahre alt bist.' });
      return;
    }
    if (paymentMethod === 'bank_transfer' && (!accountHolder.trim() || !iban.trim())) {
      setMessage({ type: 'error', text: 'Bitte gib Kontoinhaber und eine gültige IBAN an.' });
      return;
    }
    if (paymentMethod === 'paypal' && !paypalEmail.trim()) {
      setMessage({ type: 'error', text: 'Bitte gib deine PayPal-E-Mail-Adresse an.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc('submit_my_payout_details', {
      p_payout_id: payout.id,
      p_payment_method: paymentMethod,
      p_account_holder: paymentMethod === 'bank_transfer' ? accountHolder.trim() : null,
      p_iban: paymentMethod === 'bank_transfer' ? iban.trim() : null,
      p_paypal_email: paymentMethod === 'paypal' ? paypalEmail.trim() : null,
      p_age_confirmed: ageConfirmed,
    });
    setSaving(false);
    if (error) {
      setMessage({ type: 'error', text: error.message.includes('AGE_CONFIRMATION') ? 'Die 18+-Bestätigung fehlt.' : 'Die Daten konnten nicht gespeichert werden. Bitte prüfe deine Eingabe.' });
      return;
    }

    setAccountHolder('');
    setIban('');
    setPaypalEmail('');
    setAgeConfirmed(false);
    setSelectedPayoutId(null);
    setMessage({ type: 'success', text: 'Deine Angaben wurden sicher übermittelt. Du musst nichts per E-Mail schicken.' });
    await loadPayouts();
  };

  return <main className="relative min-h-screen overflow-hidden bg-[#050607] px-5 py-10 text-white sm:py-14">
    <div className="pointer-events-none fixed inset-0"><div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_8%,rgba(16,185,129,0.2),transparent_32%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,rgba(5,6,7,0)_0%,#050607_82%)]" /></div>
    <div className="relative mx-auto max-w-4xl">
      <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-500 transition hover:text-white"><ChevronLeft size={17} />Profil</Link>
      <div className="mt-7 rounded-[2.25rem] border border-emerald-300/15 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.12),transparent_45%),rgba(9,9,11,0.82)] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-9"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100"><WalletCards className="h-3.5 w-3.5" />Prize payout</div><h1 className="mt-5 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Deine Auszahlungen</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Wenn du gewonnen hast, kannst du hier deinen Zahlungsweg sicher hinterlegen. Bitte schicke Zahlungsdaten niemals per E-Mail, Discord oder Ticket.</p></div><div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-200"><LockKeyhole /></div></div><p className="mt-6 flex gap-2 rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-zinc-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />Wir verwenden deine Angaben nur zur Auszahlung. Sie werden nicht im öffentlichen Profil angezeigt und nach erfolgter Auszahlung automatisch aus diesem Bereich entfernt.</p></div>

      {message && <div className={`mt-5 rounded-2xl border p-4 text-sm font-semibold ${message.type === 'success' ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100' : 'border-rose-300/20 bg-rose-400/10 text-rose-100'}`}>{message.text}</div>}

      <section className="mt-6 space-y-4">{loading ? <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center text-zinc-500"><Loader2 className="mx-auto mb-3 animate-spin text-emerald-300" />Auszahlungen werden geladen …</div> : payouts.length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 p-12 text-center"><WalletCards className="mx-auto mb-4 text-zinc-600" size={34} /><h2 className="text-xl font-black">Aktuell keine Auszahlung offen.</h2><p className="mt-2 text-sm text-zinc-500">Sobald dir ein Preisgeld zugeordnet wird, erscheint es hier.</p></div> : payouts.map((payout) => { const status = statusCopy[payout.status]; const isOpen = selectedPayoutId === payout.id; const canSubmit = !['paid', 'cancelled'].includes(payout.status); return <article key={payout.id} className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/75 shadow-xl shadow-black/20"><div className="p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{payout.source_label}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${status.className}`}>{status.label}</span></div><p className="mt-2 text-sm text-zinc-400">{status.description}</p><p className="mt-3 text-xs text-zinc-500">Fällig bis: {formatDate(payout.due_at)}{payout.paid_at ? ` · ausgezahlt am ${formatDate(payout.paid_at)}` : ''}</p></div><strong className="text-3xl font-black text-emerald-100">{(payout.amount_cents / 100).toFixed(2).replace('.', ',')} €</strong></div>{payout.details_submitted_at && <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.06] px-3 py-2 text-xs font-bold text-emerald-100"><CheckCircle2 className="h-4 w-4" />Zahlungsweg sicher hinterlegt am {formatDate(payout.details_submitted_at)}</p>}{canSubmit && <div className="mt-5"><button onClick={() => { setSelectedPayoutId(isOpen ? null : payout.id); setMessage(null); }} className="rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-black">{isOpen ? 'Formular schließen' : payout.details_submitted_at ? 'Zahlungsweg ändern' : 'Zahlungsweg hinterlegen'}</button></div>}</div>{isOpen && canSubmit && <div className="border-t border-white/10 bg-black/25 p-5 sm:p-6"><div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Sicherer Auszahlungsauftrag</p><p className="mt-2 text-sm text-zinc-400">Bitte hinterlege ausschließlich die für deinen gewählten Zahlungsweg nötigen Daten.</p></div><div className="grid gap-3 sm:grid-cols-2"><button onClick={() => setPaymentMethod('bank_transfer')} className={`rounded-2xl border p-4 text-left transition ${paymentMethod === 'bank_transfer' ? 'border-emerald-300/35 bg-emerald-400/10' : 'border-white/10 bg-white/[0.03]'}`}><Landmark className="h-5 w-5 text-emerald-200" /><p className="mt-3 text-sm font-black">Überweisung</p><p className="mt-1 text-xs text-zinc-500">Kontoinhaber und IBAN</p></button><button onClick={() => setPaymentMethod('paypal')} className={`rounded-2xl border p-4 text-left transition ${paymentMethod === 'paypal' ? 'border-cyan-300/35 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03]'}`}><WalletCards className="h-5 w-5 text-cyan-200" /><p className="mt-3 text-sm font-black">PayPal</p><p className="mt-1 text-xs text-zinc-500">Nur deine PayPal-E-Mail</p></button></div>{paymentMethod === 'bank_transfer' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-zinc-300">Kontoinhaber<input value={accountHolder} onChange={(event) => setAccountHolder(event.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-emerald-300/60" /></label><label className="text-sm font-bold text-zinc-300">IBAN<input value={iban} onChange={(event) => setIban(event.target.value)} autoComplete="off" inputMode="text" placeholder="DE12 3456 …" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 uppercase text-white outline-none focus:border-emerald-300/60" /></label></div> : <label className="mt-4 block text-sm font-bold text-zinc-300">PayPal-E-Mail-Adresse<input type="email" value={paypalEmail} onChange={(event) => setPaypalEmail(event.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none focus:border-cyan-300/60" /></label>}<label className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-sm leading-6 text-zinc-300"><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-400" /><span>Ich bestätige, dass ich mindestens 18 Jahre alt bin und die Auszahlung auf den angegebenen Zahlungsweg erfolgen darf.</span></label><button onClick={() => void submitDetails(payout)} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-5 py-3 text-xs font-black uppercase tracking-[0.12em] text-black disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}{saving ? 'Wird sicher übermittelt …' : 'Daten sicher übermitteln'}</button></div>}</article>; })}</section>
    </div>
  </main>;
}

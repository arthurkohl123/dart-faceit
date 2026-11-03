'use client';

import { useState } from 'react';
import { ArrowUpRight, BadgeCheck, LoaderCircle } from 'lucide-react';

export function PremiumCancellationActions() {
  const [loading, setLoading] = useState<'cancel' | 'manage' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async (flow: 'cancel' | 'manage') => {
    setLoading(flow);
    setError(null);
    try {
      const response = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || 'Das Abo-Portal konnte nicht geöffnet werden.');
      window.location.assign(data.url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Das Abo-Portal konnte nicht geöffnet werden.');
      setLoading(null);
    }
  };

  return <section className="rules-library__cancellation-card">
    <div className="rules-library__cancellation-copy"><span className="rules-library__cancellation-icon"><BadgeCheck className="h-5 w-5" /></span><div><p className="rules-library__section-label">Sicherer Selbstservice</p><h2>Online kündigen oder Abo verwalten</h2><p>Melde dich mit deinem RankedDarts-Account an. Der erste Button öffnet den sicheren Stripe-Kündigungsablauf für dein aktives Abo; dort bestätigst du die Kündigung direkt.</p></div></div>
    <div className="rules-library__cancellation-actions">
      <button onClick={() => void openPortal('cancel')} disabled={loading !== null} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black transition hover:bg-emerald-200 disabled:opacity-60">{loading === 'cancel' ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Wird geöffnet …</> : <>Verträge hier kündigen <ArrowUpRight className="h-4 w-4" /></>}</button>
      <button onClick={() => void openPortal('manage')} disabled={loading !== null} className="rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-60">{loading === 'manage' ? 'Wird geöffnet …' : 'Zahlung & Abo verwalten'}</button>
    </div>
    {error && <p className="mt-4 text-sm font-semibold text-rose-200">{error}</p>}
  </section>;
}

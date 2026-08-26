'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type TotpEnrollment = { id: string; qrCode: string; secret: string };

function MfaSetup() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = searchParams.get('redirectTo')?.startsWith('/')
    ? searchParams.get('redirectTo')!
    : '/admin';

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/auth/login'); return; }

      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel === 'aal2') { router.replace(redirectTo); return; }

      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) { setError(factorsError.message); setLoading(false); return; }
      const verified = factors.totp.find((factor) => factor.status === 'verified');
      if (verified) {
        if (mounted) { setFactorId(verified.id); setLoading(false); }
        return;
      }

      for (const factor of factors.all.filter((item) => item.factor_type === 'totp' && item.status === 'unverified')) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) { setError(unenrollError.message); setLoading(false); return; }
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'RankedDarts Admin',
      });
      if (!mounted) return;
      if (enrollError) { setError(enrollError.message); setLoading(false); return; }
      setFactorId(data.id);
      setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [redirectTo, router, supabase]);

  async function verify() {
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setVerifying(true); setError('');
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) { setError(challengeError.message); setVerifying(false); return; }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (verifyError) { setError('Der Code ist ungültig oder abgelaufen.'); setVerifying(false); return; }
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#050607] px-5 py-12 text-white">
      <section className="w-full max-w-lg rounded-[2rem] border border-emerald-300/20 bg-white/[0.045] p-6 shadow-2xl shadow-emerald-950/30 sm:p-9">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-300 text-black"><ShieldCheck /></div>
        <p className="mt-6 text-xs font-black uppercase tracking-[.18em] text-emerald-300">Admin-Sicherheit</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-.05em]">Zwei-Faktor-Anmeldung</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">Admin- und Developer-Zugriffe werden zusätzlich mit einem sechsstelligen Authenticator-Code geschützt.</p>

        {loading ? <div className="mt-8 flex items-center gap-3 text-sm text-zinc-400"><Loader2 className="animate-spin" /> Sicherheitsstatus wird geprüft…</div> : (
          <div className="mt-8 space-y-5">
            {enrollment && <div className="rounded-2xl bg-white p-4 text-center">
              {/* Supabase returns an inline SVG data URL generated for this enrollment. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qrCode} alt="QR-Code für die Authenticator-App" className="mx-auto h-52 w-52" />
              <p className="mt-3 break-all font-mono text-xs text-zinc-700">{enrollment.secret}</p>
            </div>}
            <div>
              <label className="text-xs font-bold text-zinc-400">Code aus deiner Authenticator-App</label>
              <div className="mt-2 flex gap-2">
                <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-xl font-black tracking-[.35em] outline-none focus:border-emerald-300/50" />
                <button onClick={() => void verify()} disabled={verifying || code.length !== 6} className="rounded-xl bg-emerald-300 px-5 font-black text-black disabled:opacity-40">{verifying ? <Loader2 className="animate-spin" /> : <KeyRound />}</button>
              </div>
            </div>
            {error && <p className="rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          </div>
        )}
        <Link href="/" className="mt-7 inline-block text-xs font-bold text-zinc-500 hover:text-white">← Zur Startseite</Link>
      </section>
    </main>
  );
}

export default function MfaPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#050607] text-zinc-400"><Loader2 className="animate-spin" /></main>}><MfaSetup /></Suspense>;
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type PayoutAlertRow = {
  id: string;
  amount_cents: number;
  status: 'open' | 'details_requested' | 'ready' | 'paid' | 'on_hold' | 'cancelled';
};

export function PayoutAlert() {
  const supabase = useMemo(() => createClient(), []);
  const [payoutCount, setPayoutCount] = useState(0);
  const [totalCents, setTotalCents] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc('get_my_payouts');
      if (error || !active) return;
      const pending = ((data ?? []) as PayoutAlertRow[]).filter((payout) => payout.status === 'details_requested');
      setPayoutCount(pending.length);
      setTotalCents(pending.reduce((total, payout) => total + Number(payout.amount_cents ?? 0), 0));
    };
    void load();
    return () => { active = false; };
  }, [supabase]);

  if (payoutCount === 0) return null;

  return (
    <aside className="relative overflow-hidden rounded-[1.75rem] border border-amber-300/35 bg-gradient-to-r from-amber-400/[0.16] via-orange-400/[0.08] to-emerald-400/[0.1] p-5 shadow-[0_18px_65px_rgba(251,191,36,0.12)] sm:p-6">
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-300/25 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300 text-black shadow-lg shadow-amber-300/20"><WalletCards className="h-6 w-6" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Auszahlung erforderlich</p><h2 className="mt-1 text-lg font-black text-white">Dein Preisgeld wartet auf deine Angaben.</h2><p className="mt-1 text-sm text-zinc-200">{payoutCount} offene Auszahlung{payoutCount === 1 ? '' : 'en'}{totalCents > 0 ? ` · ${(totalCents / 100).toFixed(2).replace('.', ',')} €` : ''}</p></div></div>
        <Link href="/account/payouts" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-black transition hover:bg-amber-200">Jetzt Angaben hinterlegen <ArrowUpRight className="h-4 w-4" /></Link>
      </div>
    </aside>
  );
}

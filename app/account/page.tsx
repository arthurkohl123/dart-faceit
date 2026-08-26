'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Download, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export default function AccountPage() {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function deleteAccount() {
    if (confirmation !== 'ACCOUNT LÖSCHEN') return;
    setDeleting(true); setError('');
    const response = await fetch('/api/account/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ confirmation }) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? 'Der Account konnte nicht gelöscht werden.'); setDeleting(false); return;
    }
    await createClient().auth.signOut();
    window.location.assign('/');
  }

  return <main className="min-h-screen bg-[#050607] px-5 py-12 text-white">
    <div className="mx-auto max-w-3xl">
      <Link href="/profile" className="text-sm font-bold text-zinc-500 hover:text-white">← Profil</Link>
      <h1 className="mt-6 text-4xl font-black tracking-[-.05em]">Account & Daten</h1>
      <p className="mt-3 text-zinc-400">Exportiere deine gespeicherten Daten oder lösche deinen RankedDarts-Account.</p>
      <section className="mt-8 rounded-3xl border border-white/10 bg-white/[.04] p-6">
        <Download className="text-emerald-300" /><h2 className="mt-4 text-xl font-black">Datenexport</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Der Export enthält Profil, Matchhistorie, Benachrichtigungen, Turnierteilnahmen und Support-Tickets als JSON-Datei.</p>
        <a href="/api/account/export" className="mt-5 inline-flex rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-black">Daten herunterladen</a>
      </section>
      <section className="mt-5 rounded-3xl border border-red-300/20 bg-red-500/[.06] p-6">
        <ShieldAlert className="text-red-300" /><h2 className="mt-4 text-xl font-black">Account endgültig löschen</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Ein aktives Premium-Abo muss vorher gekündigt werden. Persönliche Profildaten werden entfernt; anonymisierte Matchwerte können zur Integrität von Ranglisten und Gegnerhistorien bestehen bleiben.</p>
        <label className="mt-5 block text-xs font-bold text-zinc-400">Tippe ACCOUNT LÖSCHEN zur Bestätigung</label>
        <input value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-red-300/20 bg-black/30 px-4 py-3 outline-none focus:border-red-300/60" />
        <button onClick={()=>void deleteAccount()} disabled={deleting || confirmation!=='ACCOUNT LÖSCHEN'} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-sm font-black disabled:opacity-40">{deleting?<Loader2 className="animate-spin"/>:<Trash2/>} Account löschen</button>
        {error && <p className="mt-4 text-sm font-semibold text-red-200">{error}</p>}
      </section>
    </div>
  </main>;
}

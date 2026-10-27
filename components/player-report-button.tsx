'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Flag, Loader2, ShieldAlert, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type ReportSource = 'matchroom' | 'profile';

type ReportResult = {
  ticket_id?: string;
  created?: boolean;
};

const reasons = [
  { value: 'abusive_behavior', label: 'Beleidigungen oder respektloses Verhalten' },
  { value: 'unsporting_behavior', label: 'Unsportliches Verhalten' },
  { value: 'suspected_cheating', label: 'Verdacht auf Regelverstoß oder Betrug' },
  { value: 'other', label: 'Etwas anderes' },
] as const;

export function PlayerReportButton({
  targetUserId,
  targetUsername,
  source,
  matchId,
  triggerClassName,
}: {
  targetUserId: string;
  targetUsername: string;
  source: ReportSource;
  matchId?: string | null;
  triggerClassName?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number]['value']>('abusive_behavior');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError('');
    setSuccess('');
  };

  const submit = async () => {
    const description = message.trim();
    if (description.length < 10) {
      setError('Bitte beschreibe den Vorfall mit mindestens 10 Zeichen.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('report_player_incident', {
        p_target_user_id: targetUserId,
        p_source: source,
        p_match_id: matchId ?? null,
        p_reason: reason,
        p_message: description,
      });
      if (rpcError) throw rpcError;

      const result = (Array.isArray(data) ? data[0] : data) as ReportResult | null;
      setSuccess(result?.created === false
        ? 'Eine offene Meldung zu diesem Vorfall liegt bereits beim Moderationsteam.'
        : 'Deine Meldung wurde an das Moderationsteam übergeben.');
      setMessage('');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Die Meldung konnte nicht gesendet werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex items-center gap-2 rounded-xl border border-rose-300/25 bg-rose-400/[0.08] px-3.5 py-2.5 text-xs font-black text-rose-100 transition hover:border-rose-300/45 hover:bg-rose-400/[0.14]'}
      >
        <Flag className="h-3.5 w-3.5" /> Spieler melden
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="presentation" onMouseDown={close}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-report-title"
            className="w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-rose-300/20 bg-[#0b1512] shadow-[0_28px_100px_rgba(0,0,0,.55)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/10 bg-gradient-to-r from-rose-400/[0.10] to-transparent px-5 py-5 sm:px-6">
              <div className="flex min-w-0 gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-rose-300/20 bg-rose-400/10 text-rose-200"><ShieldAlert className="h-5 w-5" /></span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Fair Play</p>
                  <h2 id="player-report-title" className="mt-1 text-xl font-black tracking-[-0.04em] text-white">{targetUsername} melden</h2>
                </div>
              </div>
              <button type="button" onClick={close} disabled={busy} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40" aria-label="Meldung schließen"><X className="h-4 w-4" /></button>
            </header>

            <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              {success ? (
                <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/[0.10] p-4 text-sm leading-6 text-emerald-50">
                  <CheckCircle2 className="mb-2 h-5 w-5 text-emerald-200" />
                  {success}
                  <button type="button" onClick={close} className="mt-3 block text-xs font-black uppercase tracking-[0.14em] text-emerald-200 hover:text-white">Schließen</button>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-6 text-zinc-400">Meldungen werden vertraulich geprüft. Bitte beschreibe nur konkrete Beobachtungen; eine Meldung führt nicht automatisch zu einer Sanktion.</p>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Grund</span>
                    <select value={reason} onChange={(event) => setReason(event.target.value as (typeof reasons)[number]['value'])} className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-rose-300/50">
                      {reasons.map((option) => <option key={option.value} value={option.value} className="bg-[#0b1512]">{option.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Was ist passiert?</span>
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1600} rows={5} className="w-full resize-none rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-rose-300/50" placeholder="Beschreibe den Vorfall möglichst konkret …" />
                    <span className="mt-1 block text-right text-[10px] font-medium text-zinc-600">{message.trim().length}/1600</span>
                  </label>
                  {error ? <p className="rounded-xl border border-rose-300/20 bg-rose-400/[0.08] px-3 py-2.5 text-xs font-semibold leading-5 text-rose-100">{error}</p> : null}
                  <button type="button" onClick={() => void submit()} disabled={busy || message.trim().length < 10} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-300/25 bg-rose-400/[0.12] px-5 py-3.5 text-sm font-black text-rose-50 transition hover:bg-rose-400/[0.18] disabled:cursor-not-allowed disabled:opacity-45">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                    {busy ? 'Wird übergeben …' : 'Meldung an Moderation senden'}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

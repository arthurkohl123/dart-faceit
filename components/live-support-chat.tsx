'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Headphones, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type ConversationState = {
  status: 'waiting' | 'active' | 'closed';
  agent_username: string | null;
  closed_at: string | null;
};

type SupportMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'user' | 'agent';
  content: string;
  created_at: string;
};

function time(value: string) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function LiveSupportChat({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<ConversationState | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    const [stateResult, messageResult] = await Promise.all([
      supabase.rpc('live_support_get_conversation_state', { p_conversation_id: conversationId }),
      supabase.rpc('live_support_list_messages', { p_conversation_id: conversationId }),
    ]);
    if (stateResult.error) setError(stateResult.error.message);
    else setState(((stateResult.data ?? []) as ConversationState[])[0] ?? null);
    if (messageResult.error) setError(messageResult.error.message);
    else setMessages((messageResult.data ?? []) as SupportMessage[]);
    if (showLoader) setLoading(false);
  }, [conversationId, supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(true); }, 0);
    const interval = window.setInterval(() => { void load(); }, 4_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages, state?.status]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = value.trim();
    if (!content || sending || state?.status === 'closed') return;
    setSending(true);
    setError(null);
    const { error: sendError } = await supabase.rpc('live_support_send_message', { p_conversation_id: conversationId, p_content: content });
    if (sendError) setError(sendError.message);
    else { setValue(''); await load(); }
    setSending(false);
  };

  const closeConversation = async () => {
    setClosing(true);
    const { error: closeError } = await supabase.rpc('live_support_close_conversation', { p_conversation_id: conversationId });
    if (closeError) { setError(closeError.message); setClosing(false); return; }
    onClose();
  };

  const waiting = state?.status === 'waiting';
  const active = state?.status === 'active';
  const closed = state?.status === 'closed';

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div role="dialog" aria-modal="true" aria-label="Live Support" className="flex h-[min(47rem,calc(100vh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-violet-300/30 bg-[#090b12] shadow-[0_30px_100px_rgba(0,0,0,0.82)]">
        <header className="relative overflow-hidden border-b border-white/10 px-5 py-4 sm:px-6"><div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-violet-400/20 blur-3xl" /><div className="relative flex items-start justify-between"><div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-violet-300/25 bg-violet-400/10 text-violet-100"><Headphones className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">RankedDarts Live Support</p><h2 className="mt-0.5 text-lg font-black">{waiting ? 'Warte auf einen Support-Mitarbeiter' : active ? `${state?.agent_username ?? 'Support'} ist im Chat` : closed ? 'Konversation geschlossen' : 'Live Support'}</h2><p className={`mt-1 flex items-center gap-1.5 text-[11px] font-bold ${active ? 'text-emerald-200' : waiting ? 'text-amber-200' : 'text-zinc-500'}`}><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]' : waiting ? 'bg-amber-300 animate-pulse' : 'bg-zinc-600'}`} />{active ? 'Support-Mitarbeiter aktiv' : waiting ? 'Anfrage wurde übermittelt' : 'Beendet'}</p></div></div><button onClick={onClose} aria-label="Live Support schließen" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div></header>

        {waiting && <div className="border-b border-amber-300/15 bg-amber-300/[0.06] px-5 py-3 text-xs font-bold text-amber-50">Deine Anfrage ist bei den verfügbaren Admins eingegangen. Beschreibe dein Anliegen gern schon genauer.</div>}
        {closed && <div className="border-b border-emerald-300/20 bg-emerald-400/[0.08] px-5 py-4"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><p className="text-sm font-black text-emerald-100">Der Live-Support-Chat wurde geschlossen.</p><p className="mt-1 text-xs leading-5 text-emerald-100/70">Der Support hat die Unterhaltung beendet. Wenn noch etwas offen ist, kannst du bei erneutem Live Support eine neue Anfrage starten.</p></div></div></div>}

        <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_85%_10%,rgba(139,92,246,0.08),transparent_30%)] p-4 sm:p-6">{loading ? <div className="grid h-full place-items-center text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /></div> : messages.length === 0 ? <div className="grid h-full place-items-center text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-200"><Headphones className="h-6 w-6" /></div><p className="mt-4 text-lg font-black text-zinc-200">Wie können wir helfen?</p><p className="mt-2 text-sm text-zinc-500">Ein Admin übernimmt den Chat, sobald er verfügbar ist.</p></div></div> : <div className="space-y-4">{messages.map((message) => { const isAdmin = message.sender_role === 'agent'; return <div key={message.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-5 shadow-lg ${isAdmin ? 'rounded-bl-md border border-violet-300/25 bg-gradient-to-br from-violet-400/18 to-cyan-400/[0.08] text-violet-50 shadow-violet-950/30' : 'rounded-br-md bg-violet-300 text-black shadow-violet-300/10'}`}>{isAdmin && <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-violet-100"><ShieldCheck className="h-3 w-3" />Admin · {message.sender_name}</div>}<p className="whitespace-pre-wrap break-words">{message.content}</p><p className={`mt-2 text-[10px] font-bold ${isAdmin ? 'text-violet-200/60' : 'text-black/55'}`}>{isAdmin ? `Support · ${time(message.created_at)}` : `Du · ${time(message.created_at)}`}</p></div></div>; })}<div ref={bottomRef} /></div>}</div>

        <form onSubmit={(event) => void send(event)} className="border-t border-white/10 bg-black/20 p-3 sm:p-4">{error && <p className="mb-2 rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-xs font-bold text-red-100">{error}</p>}<div className="flex items-end gap-2"><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={waiting ? 'Beschreibe dein Anliegen …' : 'Nachricht schreiben …'} maxLength={1500} rows={1} disabled={closed} className="max-h-28 min-h-11 flex-1 resize-y rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-300/45 focus:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50" /><button type="submit" disabled={!value.trim() || sending || closed} aria-label="Nachricht senden" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-300 text-black transition hover:bg-violet-200 disabled:opacity-45">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div><div className="mt-2 flex items-center justify-between px-1"><p className="text-[10px] font-medium text-zinc-600">Live Support ist kein Ersatz für ein formelles Ticket.</p><button type="button" onClick={() => void closeConversation()} disabled={closing || closed} className="text-[10px] font-black text-zinc-500 transition hover:text-zinc-200 disabled:opacity-40">{closing ? 'Schließt …' : 'Chat schließen'}</button></div></form>
      </div>
    </div>
  );
}

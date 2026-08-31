'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Loader2, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type SupportState = {
  is_available: boolean;
  agents_online: number;
  conversation_id: string | null;
  conversation_status: 'waiting' | 'active' | 'closed' | null;
  agent_username: string | null;
};

type SupportMessage = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: 'user' | 'agent';
  content: string;
  created_at: string;
};

export function LiveSupportChat({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<SupportState | null>(null);
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
      supabase.rpc('live_support_get_user_state'),
      supabase.rpc('live_support_list_messages', { p_conversation_id: conversationId }),
    ]);
    if (stateResult.error) setError(stateResult.error.message);
    else setState(((stateResult.data ?? []) as SupportState[])[0] ?? null);
    if (messageResult.error) setError(messageResult.error.message);
    else setMessages((messageResult.data ?? []) as SupportMessage[]);
    if (showLoader) setLoading(false);
  }, [conversationId, supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(true); }, 0);
    const interval = window.setInterval(() => { void load(); }, 4_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = value.trim();
    if (!content || sending || state?.conversation_status === 'closed') return;
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

  const waiting = state?.conversation_status === 'waiting';
  const closed = state?.conversation_status === 'closed';

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div role="dialog" aria-modal="true" aria-label="Live Support" className="flex h-[min(46rem,calc(100vh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-violet-300/25 bg-[#0a0b10] shadow-2xl shadow-black/80">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-violet-300/25 bg-violet-400/10 text-violet-200"><Headphones className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">RankedDarts Live Support</p><h2 className="text-lg font-black">{waiting ? 'Warte auf einen Support-Mitarbeiter' : state?.agent_username ? `${state.agent_username} ist im Chat` : closed ? 'Konversation geschlossen' : 'Live Support'}</h2></div></div><button onClick={onClose} aria-label="Live Support schließen" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
        {waiting && <div className="border-b border-violet-300/15 bg-violet-400/[0.06] px-5 py-3 text-xs font-bold text-violet-100">Deine Anfrage ist bei den verfügbaren Admins eingegangen. Du kannst dein Anliegen schon beschreiben.</div>}
        {closed && <div className="border-b border-white/10 bg-white/[0.04] px-5 py-3 text-xs font-bold text-zinc-400">Dieser Support-Chat wurde geschlossen.</div>}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{loading ? <div className="grid h-full place-items-center text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /></div> : messages.length === 0 ? <div className="grid h-full place-items-center text-center"><div><p className="text-lg font-black text-zinc-200">Wie können wir helfen?</p><p className="mt-2 text-sm text-zinc-500">Schreib kurz, worum es geht – ein Admin übernimmt den Chat.</p></div></div> : <div className="space-y-3">{messages.map((message) => { const mine = message.sender_role === 'user'; return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-5 ${mine ? 'rounded-br-md bg-violet-300 text-black' : 'rounded-bl-md border border-white/10 bg-white/[0.055] text-zinc-100'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><p className={`mt-1 text-[10px] font-bold ${mine ? 'text-black/55' : 'text-zinc-500'}`}>{mine ? 'Du' : message.sender_name} · {new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}</p></div></div>; })}<div ref={bottomRef} /></div>}</div>
        <form onSubmit={(event) => void send(event)} className="border-t border-white/10 p-3 sm:p-4">{error && <p className="mb-2 text-xs font-bold text-red-200">{error}</p>}<div className="flex items-end gap-2"><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={waiting ? 'Beschreibe dein Anliegen …' : 'Nachricht schreiben …'} maxLength={1500} rows={1} disabled={closed} className="max-h-28 min-h-11 flex-1 resize-y rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-300/45 disabled:opacity-50" /><button type="submit" disabled={!value.trim() || sending || closed} aria-label="Nachricht senden" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-300 text-black transition hover:bg-violet-200 disabled:opacity-45">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div><div className="mt-2 flex items-center justify-between px-1"><p className="text-[10px] font-medium text-zinc-600">Live Support ist kein Ersatz für ein formelles Ticket.</p><button type="button" onClick={() => void closeConversation()} disabled={closing || closed} className="text-[10px] font-black text-zinc-500 transition hover:text-zinc-200 disabled:opacity-40">{closing ? 'Schließt …' : 'Chat schließen'}</button></div></form>
      </div>
    </div>
  );
}

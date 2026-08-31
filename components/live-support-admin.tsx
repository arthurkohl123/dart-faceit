'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Headphones, Loader2, Send, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type AgentState = { is_available: boolean; agents_online: number; waiting_count: number };
type Conversation = { conversation_id: string; requester_id: string; requester_username: string; status: 'waiting' | 'active'; agent_id: string | null; agent_username: string | null; created_at: string; accepted_at: string | null; last_message_at: string; last_message: string | null };
type Message = { id: string; sender_id: string; sender_name: string; sender_role: 'user' | 'agent'; content: string; created_at: string };

export function LiveSupportAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AgentState | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [stateResult, conversationResult] = await Promise.all([
      supabase.rpc('live_support_get_agent_state'),
      supabase.rpc('live_support_admin_list_conversations'),
    ]);
    if (stateResult.error) { setError(stateResult.error.message); setReady(true); return; }
    setState(((stateResult.data ?? []) as AgentState[])[0] ?? null);
    if (conversationResult.error) setError(conversationResult.error.message);
    else { setError(null); setConversations((conversationResult.data ?? []) as Conversation[]); }
    setReady(true);
  }, [supabase]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: messageError } = await supabase.rpc('live_support_list_messages', { p_conversation_id: conversationId });
    if (messageError) setError(messageError.message);
    else setMessages((data ?? []) as Message[]);
  }, [supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, 6_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const initial = window.setTimeout(() => { void loadMessages(selectedId); }, 0);
    const interval = window.setInterval(() => { void loadMessages(selectedId); }, 4_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!state?.is_available) return;
    const heartbeat = () => { void supabase.rpc('live_support_agent_heartbeat'); };
    heartbeat();
    const interval = window.setInterval(heartbeat, 45_000);
    return () => window.clearInterval(interval);
  }, [state?.is_available, supabase]);

  const setAvailability = async (available: boolean) => {
    setBusy(true); setError(null);
    const { error: availabilityError } = await supabase.rpc('live_support_set_agent_availability', { p_available: available });
    if (availabilityError) setError(availabilityError.message);
    await load(); setBusy(false);
  };

  const accept = async (conversationId: string) => {
    setBusy(true); setError(null);
    const { error: acceptError } = await supabase.rpc('live_support_accept_conversation', { p_conversation_id: conversationId });
    if (acceptError) setError(acceptError.message);
    else { setSelectedId(conversationId); await loadMessages(conversationId); }
    await load(); setBusy(false);
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !value.trim() || busy) return;
    setBusy(true); setError(null);
    const { error: sendError } = await supabase.rpc('live_support_send_message', { p_conversation_id: selectedId, p_content: value.trim() });
    if (sendError) setError(sendError.message);
    else { setValue(''); await loadMessages(selectedId); }
    setBusy(false);
  };

  const close = async () => {
    if (!selectedId) return;
    setBusy(true);
    const { error: closeError } = await supabase.rpc('live_support_close_conversation', { p_conversation_id: selectedId });
    if (closeError) setError(closeError.message);
    else { setSelectedId(null); setMessages([]); await load(); }
    setBusy(false);
  };

  if (!ready) return <section className="mt-8 rounded-[2rem] border border-violet-300/15 bg-violet-400/[0.04] p-6 text-sm font-bold text-violet-100"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Live Support wird vorbereitet …</section>;
  if (!state) return null;

  const selected = conversations.find((conversation) => conversation.conversation_id === selectedId) ?? null;
  const waiting = conversations.filter((conversation) => conversation.status === 'waiting');

  return <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[#0b0d14]/90 shadow-2xl shadow-black/25"><div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-violet-400/10 blur-3xl" /><div className="relative border-b border-white/10 p-5 sm:p-6"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div className="flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-300/25 bg-violet-400/10 text-violet-200"><Headphones className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-300">Live Support Desk</p><h2 className="text-2xl font-black tracking-[-0.04em]">Direkt für Spieler erreichbar</h2><p className="mt-1 text-sm text-zinc-500">Aktiviere deine Verfügbarkeit, übernimm Anfragen und chatte privat mit dem Spieler.</p></div></div><button onClick={() => void setAvailability(!state.is_available)} disabled={busy} className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black transition disabled:opacity-50 ${state.is_available ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20' : 'border-white/15 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.09]'}`}><span className={`h-2.5 w-2.5 rounded-full ${state.is_available ? 'bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]' : 'bg-zinc-500'}`} />{state.is_available ? 'Live Support aktiv' : 'Für Live Support anmelden'}</button></div><div className="mt-5 grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/25 text-center"><div className="p-3"><p className="text-2xl font-black text-violet-200">{state.waiting_count}</p><p className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500">Wartend</p></div><div className="p-3"><p className="text-2xl font-black text-emerald-200">{state.agents_online}</p><p className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500">Online</p></div><div className="p-3"><p className="text-2xl font-black text-cyan-200">{conversations.filter((conversation) => conversation.status === 'active').length}</p><p className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-500">Deine Chats</p></div></div></div>
    <div className="relative grid min-h-[22rem] lg:grid-cols-[20rem_minmax(0,1fr)]"><aside className="border-b border-white/10 p-3 lg:border-b-0 lg:border-r"><p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">Anfragen & laufende Chats</p>{conversations.length === 0 ? <div className="p-4 text-sm text-zinc-600">Keine offenen Live-Support-Chats.</div> : <div className="space-y-1">{conversations.map((conversation) => <button key={conversation.conversation_id} onClick={() => { if (conversation.status === 'active') setSelectedId(conversation.conversation_id); }} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selectedId === conversation.conversation_id ? 'bg-violet-400/12' : 'hover:bg-white/[0.05]'}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${conversation.status === 'waiting' ? 'bg-amber-300/10 text-amber-200' : 'bg-violet-400/10 text-violet-200'}`}><UserRound className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-white">{conversation.requester_username}</span><span className="block truncate text-[11px] text-zinc-500">{conversation.status === 'waiting' ? 'Wartet auf Übernahme' : conversation.last_message ?? 'Live Support aktiv'}</span></span>{conversation.status === 'waiting' && <span className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[9px] font-black text-amber-100">NEU</span>}</button>)}</div>}</aside><section className="min-h-[22rem] p-4 sm:p-5">{selected ? <div className="flex h-full min-h-[20rem] flex-col"><div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3"><div><p className="text-xs font-black text-white">{selected.requester_username}</p><p className="text-[11px] text-emerald-200">Live Support aktiv</p></div><button onClick={() => void close()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-zinc-300 transition hover:border-red-300/30 hover:bg-red-400/10">Chat schließen</button></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">{messages.length === 0 ? <p className="text-center text-sm text-zinc-600">Noch keine Nachricht.</p> : messages.map((message) => <div key={message.id} className={`flex ${message.sender_role === 'agent' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${message.sender_role === 'agent' ? 'rounded-br-md bg-violet-300 text-black' : 'rounded-bl-md bg-white/[0.06] text-zinc-100'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><p className={`mt-1 text-[10px] font-bold ${message.sender_role === 'agent' ? 'text-black/55' : 'text-zinc-500'}`}>{message.sender_role === 'agent' ? 'Du' : message.sender_name}</p></div></div>)}</div><form onSubmit={(event) => void send(event)} className="flex gap-2 border-t border-white/10 pt-3"><textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={1500} rows={1} placeholder="Antwort schreiben …" className="min-h-11 flex-1 resize-y rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none focus:border-violet-300/45" /><button type="submit" disabled={!value.trim() || busy} className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-300 text-black disabled:opacity-50"><Send className="h-4 w-4" /></button></form></div> : waiting.length > 0 ? <div className="grid h-full place-items-center text-center"><div><p className="text-xl font-black">Neue Anfrage bereit</p><p className="mt-2 text-sm text-zinc-500">Übernimm einen Spieler aus der Liste.</p></div></div> : <div className="grid h-full place-items-center text-center"><div><Headphones className="mx-auto h-8 w-8 text-zinc-700" /><p className="mt-3 text-sm font-bold text-zinc-600">Keine Unterhaltung ausgewählt.</p></div></div>}</section></div>
    {waiting.length > 0 && <div className="relative border-t border-white/10 bg-black/20 p-4"><div className="flex flex-wrap gap-2">{waiting.map((conversation) => <button key={conversation.conversation_id} onClick={() => void accept(conversation.conversation_id)} disabled={!state.is_available || busy} className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-black text-black transition hover:bg-amber-200 disabled:opacity-45"><Check className="h-3.5 w-3.5" />{conversation.requester_username} übernehmen</button>)}</div>{!state.is_available && <p className="mt-3 text-xs font-bold text-amber-200">Aktiviere zuerst deine Verfügbarkeit, um eine Anfrage zu übernehmen.</p>}</div>}
    {error && <p className="relative border-t border-red-400/15 bg-red-400/[0.06] px-5 py-3 text-xs font-bold text-red-100">{error}</p>}
  </section>;
}

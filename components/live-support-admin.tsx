'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Headphones, Loader2, MessageCircle, Send, UserRound, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type AgentState = { is_available: boolean; agents_online: number; waiting_count: number };
type Conversation = {
  conversation_id: string;
  requester_id: string;
  requester_username: string;
  status: 'waiting' | 'active';
  agent_id: string | null;
  agent_username: string | null;
  created_at: string;
  accepted_at: string | null;
  last_message_at: string;
  last_message: string | null;
};
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

    if (stateResult.error) {
      setError(stateResult.error.message);
      setReady(true);
      return;
    }

    setState(((stateResult.data ?? []) as AgentState[])[0] ?? null);
    if (conversationResult.error) setError(conversationResult.error.message);
    else {
      setError(null);
      setConversations((conversationResult.data ?? []) as Conversation[]);
    }
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
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const initial = window.setTimeout(() => { void loadMessages(selectedId); }, 0);
    const interval = window.setInterval(() => { void loadMessages(selectedId); }, 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!state?.is_available) return;
    const heartbeat = () => { void supabase.rpc('live_support_agent_heartbeat'); };
    heartbeat();
    const interval = window.setInterval(heartbeat, 45_000);
    return () => window.clearInterval(interval);
  }, [state?.is_available, supabase]);

  const setAvailability = async (available: boolean) => {
    setBusy(true);
    setError(null);
    const { error: availabilityError } = await supabase.rpc('live_support_set_agent_availability', { p_available: available });
    if (availabilityError) setError(availabilityError.message);
    await load();
    setBusy(false);
  };

  const accept = async (conversationId: string) => {
    setBusy(true);
    setError(null);
    const { error: acceptError } = await supabase.rpc('live_support_accept_conversation', { p_conversation_id: conversationId });
    if (acceptError) setError(acceptError.message);
    else {
      setSelectedId(conversationId);
      await loadMessages(conversationId);
    }
    await load();
    setBusy(false);
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId || !value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error: sendError } = await supabase.rpc('live_support_send_message', { p_conversation_id: selectedId, p_content: value.trim() });
    if (sendError) setError(sendError.message);
    else {
      setValue('');
      await loadMessages(selectedId);
    }
    setBusy(false);
  };

  const close = async () => {
    if (!selectedId) return;
    setBusy(true);
    const { error: closeError } = await supabase.rpc('live_support_close_conversation', { p_conversation_id: selectedId });
    if (closeError) setError(closeError.message);
    else {
      setSelectedId(null);
      setMessages([]);
      await load();
    }
    setBusy(false);
  };

  if (!ready) {
    return <section className="mt-4 border border-[#304047] bg-[#10171b] px-5 py-4 text-xs font-medium tracking-[0.06em] text-[#aebfbb]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin text-[#79d3c4]" /> Support-Verbindung wird aufgebaut …</section>;
  }
  if (!state) return null;

  const selected = conversations.find((conversation) => conversation.conversation_id === selectedId) ?? null;
  const waiting = conversations.filter((conversation) => conversation.status === 'waiting');
  const active = conversations.filter((conversation) => conversation.status === 'active');

  return (
    <section className="mt-4 overflow-hidden border border-[#304047] bg-[#10171b] shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col justify-between gap-4 border-b border-[#2c393f] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${state.is_available ? 'bg-[#79d3c4] shadow-[0_0_14px_rgba(121,211,196,0.9)]' : 'bg-[#6d7b79]'}`} />
          <div><p className="text-sm font-semibold text-[#e5eeeb]">Support channel</p><p className="mt-0.5 text-[11px] text-[#748581]">{state.is_available ? 'Du bist für neue Anfragen erreichbar' : 'Aktuell nicht für Spieler sichtbar'}</p></div>
        </div>
        <button onClick={() => void setAvailability(!state.is_available)} disabled={busy} className={`inline-flex min-w-48 items-center justify-center gap-2 border px-4 py-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${state.is_available ? 'border-[#3b6d66] bg-[#17302e] text-[#b7eee4] hover:border-[#79d3c4] hover:bg-[#1b3b37]' : 'border-[#3a494d] bg-[#172025] text-[#b2c0bd] hover:border-[#66847e] hover:bg-[#1d292e]'}`}><span className={`h-1.5 w-1.5 rounded-full ${state.is_available ? 'bg-[#79d3c4]' : 'bg-[#7e8e8b]'}`} />{state.is_available ? 'Verfügbarkeit beenden' : 'Für Support anmelden'}</button>
      </div>

      <div className="grid grid-cols-3 border-b border-[#2c393f] bg-[#0d1316]">
        <StatusMetric value={state.waiting_count} label="Wartend" tone="text-[#e6b36b]" />
        <StatusMetric value={state.agents_online} label="Team online" tone="text-[#79d3c4]" divider />
        <StatusMetric value={active.length} label="Aktive Chats" tone="text-[#9eb8e8]" divider />
      </div>

      <div className="grid min-h-[32rem] lg:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className="border-b border-[#2c393f] bg-[#0d1316] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-[#253137] px-5 py-4"><div><p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#71817f]">Inbox</p><p className="mt-1 text-xs text-[#a1afac]">{conversations.length === 1 ? '1 Unterhaltung' : `${conversations.length} Unterhaltungen`}</p></div><MessageCircle className="h-4 w-4 text-[#657572]" /></div>
          {conversations.length === 0 ? <div className="px-5 py-10 text-center text-sm leading-6 text-[#73817e]">Keine offenen Gespräche.<br />Der Support-Eingang ist ruhig.</div> : <div className="p-2">{conversations.map((conversation) => <ConversationRow key={conversation.conversation_id} conversation={conversation} selected={selectedId === conversation.conversation_id} onSelect={() => { if (conversation.status === 'active') setSelectedId(conversation.conversation_id); }} />)}</div>}
        </aside>

        <section className="min-h-[32rem] bg-[#121a1e] p-4 sm:p-6">
          {selected ? <ActiveConversation conversation={selected} messages={messages} value={value} busy={busy} setValue={setValue} close={close} send={send} /> : waiting.length > 0 ? <WaitingState count={waiting.length} /> : <EmptyState />}
        </section>
      </div>

      {waiting.length > 0 && <div className="border-t border-[#304047] bg-[#141e20] px-5 py-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1ebe8]">Wartende Anfragen</p><p className="mt-1 text-[11px] text-[#839491]">Übernimm eine Unterhaltung und öffne sie direkt im Arbeitsbereich.</p></div><div className="flex flex-wrap gap-2">{waiting.map((conversation) => <button key={conversation.conversation_id} onClick={() => void accept(conversation.conversation_id)} disabled={!state.is_available || busy} className="inline-flex items-center gap-2 border border-[#3c6761] bg-[#19322f] px-3 py-2 text-xs font-medium text-[#bef0e7] transition hover:border-[#79d3c4] hover:bg-[#21413c] disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-3.5 w-3.5" /> {conversation.requester_username}</button>)}</div></div>{!state.is_available && <p className="mt-3 text-[11px] text-[#e6b36b]">Melde dich zuerst für den Support an, um eine Anfrage zu übernehmen.</p>}</div>}
      {error && <p className="border-t border-[#704a46] bg-[#2a1b1d] px-5 py-3 text-xs text-[#f2b4aa]">{error}</p>}
    </section>
  );
}

function StatusMetric({ value, label, tone, divider = false }: { value: number; label: string; tone: string; divider?: boolean }) {
  return <div className={`px-4 py-4 text-center sm:px-5 ${divider ? 'border-l border-[#253137]' : ''}`}><p className={`text-xl font-semibold tracking-[-0.04em] ${tone}`}>{value}</p><p className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[#61716e]">{label}</p></div>;
}

function ConversationRow({ conversation, selected, onSelect }: { conversation: Conversation; selected: boolean; onSelect: () => void }) {
  const isWaiting = conversation.status === 'waiting';
  return <button onClick={onSelect} className={`mb-1 flex w-full items-center gap-3 border px-3 py-3 text-left transition ${selected ? 'border-[#517d76] bg-[#172827]' : 'border-transparent hover:border-[#2e4145] hover:bg-[#141e22]'}`}><span className={`grid h-8 w-8 shrink-0 place-items-center border ${isWaiting ? 'border-[#765f3f] bg-[#292317] text-[#e6b36b]' : 'border-[#365b5b] bg-[#172b2c] text-[#79d3c4]'}`}><UserRound className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-[#dde8e5]">{conversation.requester_username}</span>{isWaiting && <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#e6b36b]">Neu</span>}</span><span className="mt-1 block truncate text-[11px] text-[#71817f]">{isWaiting ? 'Wartet auf Übernahme' : conversation.last_message ?? 'Support-Unterhaltung aktiv'}</span></span></button>;
}

function WaitingState({ count }: { count: number }) {
  return <div className="grid h-full place-items-center"><div className="max-w-sm text-center"><span className="mx-auto grid h-11 w-11 place-items-center border border-[#705c3d] bg-[#272215] text-[#e6b36b]"><Headphones className="h-5 w-5" /></span><p className="mt-5 text-xl font-semibold tracking-[-0.04em] text-[#e3ece9]">{count} {count === 1 ? 'Spieler wartet' : 'Spieler warten'}</p><p className="mt-2 text-sm leading-6 text-[#788987]">Wähle unten eine Anfrage aus. Nach der Übernahme öffnet sich das Gespräch direkt hier.</p></div></div>;
}

function EmptyState() {
  return <div className="grid h-full place-items-center"><div className="text-center"><span className="mx-auto grid h-11 w-11 place-items-center border border-[#304047] text-[#62736f]"><Headphones className="h-5 w-5" /></span><p className="mt-5 text-sm font-medium text-[#9eafac]">Noch kein Gespräch ausgewählt</p><p className="mt-2 text-xs text-[#687976]">Neue Anfragen erscheinen links in deiner Inbox.</p></div></div>;
}

function ActiveConversation({ conversation, messages, value, busy, setValue, close, send }: { conversation: Conversation; messages: Message[]; value: string; busy: boolean; setValue: (value: string) => void; close: () => void; send: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <div className="flex h-full min-h-[28rem] flex-col"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#304047] pb-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center border border-[#365b5b] bg-[#172b2c] text-[#79d3c4]"><UserRound className="h-4 w-4" /></span><div><p className="text-sm font-medium text-[#e6efec]">{conversation.requester_username}</p><p className="mt-0.5 text-[11px] text-[#79d3c4]">Live-Unterhaltung aktiv</p></div></div><button onClick={() => void close()} disabled={busy} className="inline-flex items-center gap-1.5 border border-[#465056] px-3 py-2 text-xs font-medium text-[#acbab7] transition hover:border-[#a2635c] hover:bg-[#281d1f] hover:text-[#f2b4aa] disabled:opacity-50"><X className="h-3.5 w-3.5" /> Unterhaltung schließen</button></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1">{messages.length === 0 ? <p className="grid h-full place-items-center text-sm text-[#748581]">Noch keine Nachricht in dieser Unterhaltung.</p> : messages.map((message) => <MessageBubble key={message.id} message={message} />)}</div><form onSubmit={(event) => void send(event)} className="flex gap-2 border-t border-[#304047] pt-4"><textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={1500} rows={1} placeholder="Antwort formulieren …" className="min-h-12 flex-1 resize-y border border-[#405057] bg-[#0e1519] px-3 py-3 text-sm text-[#e6efec] outline-none placeholder:text-[#657572] focus:border-[#6aa89e] focus:bg-[#101b1e]" /><button type="submit" disabled={!value.trim() || busy} className="grid h-12 w-12 shrink-0 place-items-center border border-[#5a968c] bg-[#1d403c] text-[#aaf0e3] transition hover:bg-[#286157] disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button></form></div>;
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.sender_role === 'agent';
  return <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] border px-4 py-3 text-sm shadow-[0_10px_24px_rgba(0,0,0,0.10)] ${isAgent ? 'border-[#386e66] bg-[#16312e] text-[#e1f4ef]' : 'border-[#3a484e] bg-[#171f24] text-[#dde7e4]'}`}><p className="whitespace-pre-wrap break-words leading-6">{message.content}</p><p className={`mt-2 pt-1.5 text-[9px] font-medium uppercase tracking-[0.12em] ${isAgent ? 'border-t border-[#6aa398]/25 text-[#91c9c0]' : 'border-t border-[#a4b5b1]/15 text-[#839491]'}`}>{isAgent ? 'Support · Du' : message.sender_name}</p></div></div>;
}

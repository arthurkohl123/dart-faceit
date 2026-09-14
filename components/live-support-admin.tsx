'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Headphones, Loader2, Radio, Send, UserRound } from 'lucide-react';
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
    return <section className="mt-5 border-2 border-[#141511] bg-[#f7f4ec] p-5 text-sm font-black uppercase tracking-[0.1em] text-[#141511] shadow-[6px_6px_0_#f6c453]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Verbindung zum Support-System wird hergestellt …</section>;
  }
  if (!state) return null;

  const selected = conversations.find((conversation) => conversation.conversation_id === selectedId) ?? null;
  const waiting = conversations.filter((conversation) => conversation.status === 'waiting');
  const active = conversations.filter((conversation) => conversation.status === 'active');

  return (
    <section className="mt-5 border-2 border-[#141511] bg-[#f7f4ec] shadow-[8px_8px_0_#141511]">
      <div className="grid border-b-2 border-[#141511] lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center bg-[#e44c2e] text-white"><Radio className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e44c2e]">Desk status</p>
              <h2 className="text-2xl font-black uppercase tracking-[-0.055em]">Operator Station</h2>
            </div>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#4b4a44]">Übernimm wartende Spieler, halte Gespräche am Laufen und bleib als Ansprechpartner sichtbar. Die Verfügbarkeit läuft im Hintergrund weiter.</p>
        </div>
        <div className="flex items-center border-t-2 border-[#141511] bg-[#ddd8cb] p-4 lg:border-l-2 lg:border-t-0 sm:p-5">
          <button onClick={() => void setAvailability(!state.is_available)} disabled={busy} className={`w-full border-2 border-[#141511] px-5 py-3 text-left text-xs font-black uppercase tracking-[0.1em] transition disabled:cursor-not-allowed disabled:opacity-50 ${state.is_available ? 'bg-[#8cbf8d] text-[#141511] hover:bg-[#a7d4a8]' : 'bg-[#f7f4ec] text-[#141511] hover:bg-[#f6c453]'}`}>
            <span className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${state.is_available ? 'bg-[#e44c2e] animate-pulse' : 'bg-[#74736c]'}`} />{state.is_available ? 'Support ist online' : 'Schicht starten'}</span><Headphones className="h-4 w-4" /></span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b-2 border-[#141511] bg-[#141511] text-[#f7f4ec]">
        <Metric value={state.waiting_count} label="Warten" accent="#f6c453" />
        <Metric value={state.agents_online} label="Online" accent="#8cbf8d" bordered />
        <Metric value={active.length} label="Offene Chats" accent="#e78a72" bordered />
      </div>

      <div className="grid min-h-[31rem] lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="border-b-2 border-[#141511] bg-[#ddd8cb] p-3 lg:border-b-0 lg:border-r-2">
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#504e47]">Warteschlange</p>
            <span className="border border-[#141511] bg-[#f6c453] px-1.5 py-0.5 text-[10px] font-black">{conversations.length}</span>
          </div>
          {conversations.length === 0 ? (
            <div className="border border-dashed border-[#141511]/35 px-4 py-7 text-center text-sm font-bold text-[#5e5b53]">Der Eingang ist gerade leer.</div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const isSelected = selectedId === conversation.conversation_id;
                return (
                  <button key={conversation.conversation_id} onClick={() => { if (conversation.status === 'active') setSelectedId(conversation.conversation_id); }} className={`w-full border border-[#141511] p-3 text-left transition ${isSelected ? 'bg-[#141511] text-[#f7f4ec] shadow-[3px_3px_0_#e44c2e]' : 'bg-[#f7f4ec] hover:-translate-y-0.5 hover:bg-white'}`}>
                    <span className="flex items-start gap-2.5">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center border border-current ${conversation.status === 'waiting' ? 'bg-[#f6c453] text-[#141511]' : 'bg-[#e44c2e] text-white'}`}><UserRound className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black">{conversation.requester_username}</span>{conversation.status === 'waiting' && <span className="bg-[#e44c2e] px-1.5 py-0.5 text-[9px] font-black text-white">NEU</span>}</span>
                        <span className={`mt-1 block truncate text-[11px] ${isSelected ? 'text-[#f7f4ec]/60' : 'text-[#625f57]'}`}>{conversation.status === 'waiting' ? 'Wartet auf einen Operator' : conversation.last_message ?? 'Unterhaltung aktiv'}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="min-h-[31rem] bg-[#f7f4ec] p-4 sm:p-6">
          {selected ? (
            <div className="flex h-full min-h-[27rem] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#141511] pb-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#e44c2e]">Aktive Unterhaltung</p><p className="mt-1 text-xl font-black tracking-[-0.04em]">{selected.requester_username}</p></div>
                <button onClick={() => void close()} disabled={busy} className="border-2 border-[#141511] bg-[#f7f4ec] px-3 py-2 text-xs font-black uppercase tracking-[0.1em] transition hover:bg-[#e44c2e] hover:text-white disabled:opacity-50">Chat schließen</button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1">
                {messages.length === 0 ? <EmptyConversation /> : messages.map((message) => <MessageBubble key={message.id} message={message} />)}
              </div>
              <form onSubmit={(event) => void send(event)} className="flex gap-2 border-t-2 border-[#141511] pt-4">
                <textarea value={value} onChange={(event) => setValue(event.target.value)} maxLength={1500} rows={1} placeholder="Antwort an Spieler schreiben …" className="min-h-12 flex-1 resize-y border-2 border-[#141511] bg-white px-3 py-3 text-sm font-medium text-[#141511] outline-none placeholder:text-[#77736a] focus:bg-[#fff9df]" />
                <button type="submit" disabled={!value.trim() || busy} className="grid h-12 w-12 shrink-0 place-items-center border-2 border-[#141511] bg-[#f6c453] text-[#141511] transition hover:bg-[#e44c2e] hover:text-white disabled:opacity-45"><Send className="h-4 w-4" /></button>
              </form>
            </div>
          ) : waiting.length > 0 ? (
            <div className="grid h-full place-items-center text-center"><div className="max-w-sm"><p className="text-3xl font-black uppercase tracking-[-0.06em]">Neue Anfrage</p><p className="mt-3 text-sm leading-6 text-[#5e5b53]">Ein Spieler wartet in der Warteschlange. Übernimm den Chat unten, sobald du bereit bist.</p></div></div>
          ) : (
            <div className="grid h-full place-items-center text-center"><div><Headphones className="mx-auto h-10 w-10 text-[#a19c90]" /><p className="mt-4 text-sm font-black uppercase tracking-[0.12em] text-[#747167]">Keine Unterhaltung ausgewählt</p></div></div>
          )}
        </section>
      </div>

      {waiting.length > 0 && (
        <div className="border-t-2 border-[#141511] bg-[#f6c453] p-4 sm:p-5">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.17em] text-[#5c4300]">Wartende Spieler übernehmen</p>
          <div className="flex flex-wrap gap-2">
            {waiting.map((conversation) => <button key={conversation.conversation_id} onClick={() => void accept(conversation.conversation_id)} disabled={!state.is_available || busy} className="inline-flex items-center gap-2 border-2 border-[#141511] bg-[#141511] px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-[#f7f4ec] transition hover:bg-[#e44c2e] disabled:cursor-not-allowed disabled:opacity-45"><Check className="h-3.5 w-3.5" /> {conversation.requester_username} übernehmen</button>)}
          </div>
          {!state.is_available && <p className="mt-3 text-xs font-bold text-[#644700]">Starte zuerst deine Schicht, bevor du eine Anfrage übernimmst.</p>}
        </div>
      )}

      {error && <p className="border-t-2 border-[#141511] bg-[#e44c2e] px-5 py-3 text-xs font-black text-white">{error}</p>}
    </section>
  );
}

function Metric({ value, label, accent, bordered = false }: { value: number; label: string; accent: string; bordered?: boolean }) {
  return <div className={`p-4 text-center sm:p-5 ${bordered ? 'border-l border-[#f7f4ec]/30' : ''}`}><p className="text-2xl font-black tracking-[-0.05em]" style={{ color: accent }}>{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#f7f4ec]/55">{label}</p></div>;
}

function EmptyConversation() {
  return <p className="grid h-full place-items-center text-center text-sm font-bold text-[#77736a]">Die Unterhaltung hat noch keine Nachrichten.</p>;
}

function MessageBubble({ message }: { message: Message }) {
  const isAgent = message.sender_role === 'agent';
  return <div className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] border-2 border-[#141511] px-4 py-3 text-sm shadow-[3px_3px_0_#141511] ${isAgent ? 'bg-[#f6c453] text-[#141511]' : 'bg-white text-[#141511]'}`}><p className="whitespace-pre-wrap break-words leading-6">{message.content}</p><p className="mt-2 border-t border-[#141511]/20 pt-1.5 text-[9px] font-black uppercase tracking-[0.13em] text-[#141511]/55">{isAgent ? 'Support / Du' : message.sender_name}</p></div></div>;
}

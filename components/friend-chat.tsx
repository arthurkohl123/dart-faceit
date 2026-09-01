'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type ChatMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
};

type FriendChatProps = {
  friendId: string;
  friendUsername: string;
  onClose: () => void;
  onMessagesRead?: () => void;
};

export function FriendChat({ friendId, friendUsername, onClose, onMessagesRead }: FriendChatProps) {
  const supabase = useMemo(() => createClient(), []);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    const [{ data: sessionData }, { data, error: requestError }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.rpc('list_friend_messages', { p_friend_id: friendId }),
    ]);
    setMyUserId(sessionData.session?.user?.id ?? null);
    if (requestError) setError(requestError.message);
    else {
      setError(null);
      setMessages([...(data ?? []) as ChatMessage[]].reverse());

      const { data: markedCount, error: markError } = await supabase.rpc('mark_friend_messages_read', {
        p_friend_id: friendId,
      });

      if (!markError && Number(markedCount ?? 0) > 0) {
        onMessagesRead?.();
      }
    }
    if (showLoader) setLoading(false);
  }, [friendId, onMessagesRead, supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(true); }, 0);
    const interval = window.setInterval(() => { void load(); }, 4_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = value.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    const { error: sendError } = await supabase.rpc('send_friend_message', {
      p_friend_id: friendId,
      p_content: content,
    });
    if (sendError) setError(sendError.message);
    else {
      setValue('');
      await load();
    }
    setSending(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/75 p-3 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div role="dialog" aria-modal="true" aria-label={`Chat mit ${friendUsername}`} className="flex h-[min(46rem,calc(100vh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-[#090d0e] shadow-2xl shadow-black/80">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Freundes-Chat</p><h2 className="truncate text-xl font-black">{friendUsername}</h2></div>
          <button onClick={onClose} aria-label="Chat schließen" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-400 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <div className="grid h-full place-items-center text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /></div> : error ? <div className="rounded-2xl border border-red-400/25 bg-red-400/[0.07] p-4 text-sm font-bold text-red-100">Chat konnte nicht geladen werden: {error}</div> : messages.length === 0 ? <div className="grid h-full place-items-center text-center"><div><p className="text-lg font-black text-zinc-300">Noch keine Nachrichten</p><p className="mt-2 text-sm text-zinc-500">Schreib {friendUsername} die erste Nachricht.</p></div></div> : <div className="space-y-3">{messages.map((message) => { const mine = message.sender_id === myUserId; return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-5 ${mine ? 'rounded-br-md bg-cyan-300 text-black' : 'rounded-bl-md border border-white/10 bg-white/[0.055] text-zinc-100'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><p className={`mt-1 text-[10px] font-bold ${mine ? 'text-black/55' : 'text-zinc-500'}`}>{new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}</p></div></div>; })}<div ref={bottomRef} /></div>}
        </div>
        <form onSubmit={(event) => void send(event)} className="border-t border-white/10 p-3 sm:p-4">
          {error && !loading && <p className="mb-2 text-xs font-bold text-red-200">{error}</p>}
          <div className="flex items-end gap-2"><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={`Nachricht an ${friendUsername}`} maxLength={1000} rows={1} className="max-h-28 min-h-11 flex-1 resize-y rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-300/45" /><button type="submit" disabled={!value.trim() || sending} aria-label="Nachricht senden" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-300 text-black transition hover:bg-cyan-200 disabled:opacity-45">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
          <p className="mt-2 px-1 text-[10px] font-medium text-zinc-600">Nur bestätigte Freunde können dir schreiben.</p>
        </form>
      </div>
    </div>
  );
}

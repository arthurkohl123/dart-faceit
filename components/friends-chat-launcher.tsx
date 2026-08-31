'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { FriendChat } from '@/components/friend-chat';
import { createClient } from '@/lib/supabase';

type ChatFriend = {
  user_id: string;
  username: string;
  is_online: boolean;
};

export function FriendsChatLauncher() {
  const supabase = useMemo(() => createClient(), []);
  const [friends, setFriends] = useState<ChatFriend[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatFriend, setChatFriend] = useState<ChatFriend | null>(null);

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setFriends([]);
      return;
    }
    const { data } = await supabase.rpc('list_my_friends');
    setFriends((data ?? []) as ChatFriend[]);
  }, [supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const interval = window.setInterval(() => { void load(); }, 20_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  if (friends.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40">
        {pickerOpen && <div className="mb-3 w-72 overflow-hidden rounded-[1.5rem] border border-cyan-300/25 bg-[#090d0e]/95 shadow-2xl shadow-black/70 backdrop-blur-xl"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Freundes-Chat</p><p className="text-sm font-black">Nachricht schreiben</p></div><button onClick={() => setPickerOpen(false)} aria-label="Chat-Auswahl schließen" className="grid h-8 w-8 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div><div className="max-h-72 overflow-y-auto p-2">{friends.map((friend) => <button key={friend.user_id} onClick={() => { setChatFriend(friend); setPickerOpen(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.07]"><span className={`h-2.5 w-2.5 rounded-full ${friend.is_online ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]' : 'bg-zinc-600'}`} /><span className="min-w-0 flex-1 truncate text-sm font-black text-zinc-100">{friend.username}</span><MessageCircle className="h-4 w-4 text-cyan-300" /></button>)}</div></div>}
        <button onClick={() => setPickerOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-300 px-4 py-3 text-sm font-black text-black shadow-xl shadow-cyan-400/15 transition hover:bg-cyan-200"><MessageCircle className="h-4 w-4" />Chat</button>
      </div>
      {chatFriend && <FriendChat friendId={chatFriend.user_id} friendUsername={chatFriend.username} onClose={() => setChatFriend(null)} />}
    </>
  );
}

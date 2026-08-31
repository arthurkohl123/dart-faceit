'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Headphones, Loader2, MessageCircle, X } from 'lucide-react';
import { FriendChat } from '@/components/friend-chat';
import { LiveSupportChat } from '@/components/live-support-chat';
import { createClient } from '@/lib/supabase';

type ChatFriend = {
  user_id: string;
  username: string;
  is_online: boolean;
};

type SupportState = {
  is_available: boolean;
  agents_online: number;
  conversation_id: string | null;
  conversation_status: 'waiting' | 'active' | 'closed' | null;
  agent_username: string | null;
};

export function FriendsChatLauncher() {
  const supabase = useMemo(() => createClient(), []);
  const [friends, setFriends] = useState<ChatFriend[]>([]);
  const [support, setSupport] = useState<SupportState | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatFriend, setChatFriend] = useState<ChatFriend | null>(null);
  const [supportConversationId, setSupportConversationId] = useState<string | null>(null);
  const [supportStarting, setSupportStarting] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setFriends([]);
      setSupport(null);
      return;
    }

    const [friendsResult, supportResult] = await Promise.all([
      supabase.rpc('list_my_friends'),
      supabase.rpc('live_support_get_user_state'),
    ]);

    setFriends((friendsResult.data ?? []) as ChatFriend[]);
    if (!supportResult.error) {
      setSupport(((supportResult.data ?? []) as SupportState[])[0] ?? null);
    }
  }, [supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void load();
    }, 0);
    const interval = window.setInterval(() => {
      void load();
    }, 8_000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  const openSupport = async () => {
    setSupportError(null);

    if (support?.conversation_id) {
      setSupportConversationId(support.conversation_id);
      setPickerOpen(false);
      return;
    }

    if (!support?.is_available) return;

    setSupportStarting(true);
    const { data, error } = await supabase.rpc('live_support_request');
    setSupportStarting(false);

    if (error) {
      setSupportError(error.message);
      return;
    }

    const result = data as { conversation_id?: string } | null;
    if (result?.conversation_id) {
      setSupportConversationId(result.conversation_id);
      setPickerOpen(false);
      await load();
    }
  };

  const canOpenSupport = Boolean(support?.is_available || support?.conversation_id);

  if (friends.length === 0 && support === null) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-40">
        {pickerOpen && (
          <div className="mb-3 w-72 overflow-hidden rounded-[1.5rem] border border-cyan-300/25 bg-[#090d0e]/95 shadow-2xl shadow-black/70 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Chat &amp; Support</p>
                <p className="text-sm font-black">Womit möchtest du starten?</p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Chat-Auswahl schließen"
                className="grid h-8 w-8 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {support && (
                <button
                  type="button"
                  onClick={() => void openSupport()}
                  disabled={!canOpenSupport || supportStarting}
                  className={`mb-2 flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-75 ${
                    canOpenSupport
                      ? 'border-violet-300/20 bg-violet-400/[0.08] hover:bg-violet-400/[0.14]'
                      : 'border-white/10 bg-white/[0.025]'
                  }`}
                >
                  <div
                    className={`grid h-9 w-9 place-items-center rounded-xl ${
                      canOpenSupport ? 'bg-violet-300/15 text-violet-200' : 'bg-zinc-700/30 text-zinc-500'
                    }`}
                  >
                    <Headphones className="h-4 w-4" />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm font-black ${
                        canOpenSupport ? 'text-violet-100' : 'text-zinc-400'
                      }`}
                    >
                      Live Support
                    </span>
                    <span
                      className={`block text-[11px] ${
                        canOpenSupport ? 'text-violet-200/70' : 'text-zinc-600'
                      }`}
                    >
                      {support.conversation_id
                        ? support.conversation_status === 'waiting'
                          ? 'Anfrage läuft'
                          : 'Chat fortsetzen'
                        : support.is_available
                          ? `${support.agents_online} Admin${support.agents_online === 1 ? '' : 's'} verfügbar`
                          : 'Derzeit offline'}
                    </span>
                  </span>
                  {supportStarting && <Loader2 className="h-4 w-4 animate-spin text-violet-200" />}
                  {!supportStarting && (
                    <span
                      className={`h-2 w-2 rounded-full ${
                        canOpenSupport
                          ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]'
                          : 'bg-zinc-600'
                      }`}
                    />
                  )}
                </button>
              )}

              {supportError && (
                <p className="mb-2 rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-xs font-bold text-red-100">
                  {supportError}
                </p>
              )}

              {friends.length > 0 && (
                <p className="px-2 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">
                  Freunde
                </p>
              )}
              {friends.map((friend) => (
                <button
                  type="button"
                  key={friend.user_id}
                  onClick={() => {
                    setChatFriend(friend);
                    setPickerOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.07]"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      friend.is_online ? 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]' : 'bg-zinc-600'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-black text-zinc-100">{friend.username}</span>
                  <MessageCircle className="h-4 w-4 text-cyan-300" />
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-300 px-4 py-3 text-sm font-black text-black shadow-xl shadow-cyan-400/15 transition hover:bg-cyan-200"
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </button>
      </div>

      {chatFriend && (
        <FriendChat
          friendId={chatFriend.user_id}
          friendUsername={chatFriend.username}
          onClose={() => setChatFriend(null)}
        />
      )}
      {supportConversationId && (
        <LiveSupportChat
          conversationId={supportConversationId}
          onClose={() => {
            setSupportConversationId(null);
            void load();
          }}
        />
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ChevronRight, Swords, Trophy, UserPlus, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
};

function notificationIcon(type: string) {
  if (type.includes('tournament')) return <Trophy className="h-5 w-5" />;
  if (type.includes('friend')) return <UserPlus className="h-5 w-5" />;
  if (type.includes('match')) return <Swords className="h-5 w-5" />;
  return <BellRing className="h-5 w-5" />;
}

/**
 * Shows newly created, user-scoped notification rows everywhere in the app.
 * Native browser notifications are deliberately only used after the player has
 * explicitly granted the browser permission in the account settings.
 */
export function RealtimeNotificationToaster({ userId }: { userId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [notification, setNotification] = useState<NotificationRow | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!userId) return;

    const show = (next: NotificationRow) => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      setNotification(next);
      timeoutRef.current = window.setTimeout(() => setNotification(null), 10_000);

      if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
        const desktopNotice = new window.Notification(next.title, {
          body: next.body ?? 'In RankedDarts wartet eine neue Aktion auf dich.',
          icon: '/rankeddarts-logo-mark.png',
          tag: `rankeddarts-${next.id}`,
        });
        desktopNotice.onclick = () => {
          window.focus();
          if (next.href) window.location.assign(next.href);
          desktopNotice.close();
        };
      }
    };

    const channel = supabase
      .channel(`player-notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => show(payload.new as NotificationRow))
      .subscribe();

    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  if (!notification) return null;

  const content = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
        {notificationIcon(notification.type)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-white">{notification.title}</span>
        {notification.body && <span className="mt-1 block line-clamp-2 text-xs leading-5 text-zinc-400">{notification.body}</span>}
      </span>
      {notification.href && <ChevronRight className="h-5 w-5 shrink-0 text-emerald-200" />}
    </>
  );

  return (
    <aside aria-live="polite" className="fixed bottom-5 right-5 z-[95] w-[min(25rem,calc(100vw-2.5rem))] animate-in slide-in-from-right-4 fade-in duration-300">
      <div className="overflow-hidden rounded-2xl border border-emerald-300/25 bg-[#0d1211]/[0.98] p-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
        {notification.href ? (
          <Link href={notification.href} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/[0.06]">
            {content}
          </Link>
        ) : <div className="flex items-center gap-3 rounded-xl p-3">{content}</div>}
        <button type="button" onClick={() => setNotification(null)} aria-label="Hinweis schließen" className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export function NotificationBell() {
  const supabase = useMemo(() => createClient(), []);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let userId: string | null = null;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user.id ?? null;
      if (!userId) return;
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
      setUnread(count ?? 0);
    };
    void load();
    const channel = supabase.channel('notification-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase]);

  return (
    <Link href="/notifications" aria-label="Benachrichtigungen" className="relative grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/[0.04] text-zinc-200 transition hover:border-emerald-300/30 hover:bg-emerald-400/10 hover:text-emerald-100">
      <Bell size={18} />
      {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-black bg-emerald-300 px-1 text-[10px] font-black text-black">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

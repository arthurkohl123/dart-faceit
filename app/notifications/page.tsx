'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bell, CheckCheck, ChevronRight, CircleDot, Swords, Trophy } from 'lucide-react';

type Notification = { id: string; type: string; title: string; body: string | null; href: string | null; read_at: string | null; created_at: string };

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Gerade eben';
  if (minutes < 60) return `Vor ${minutes} Min.`;
  if (minutes < 1440) return `Vor ${Math.floor(minutes / 60)} Std.`;
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' }).format(new Date(value));
}

function notificationIcon(type: string) {
  return type.includes('tournament') ? <Trophy size={19} /> : type.includes('match') ? <Swords size={19} /> : <Bell size={19} />;
}

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(80);
    setNotifications((data ?? []) as Notification[]); setLoading(false);
  }, [supabase]);

  useEffect(() => {
    async function init() { const { data: { session } } = await supabase.auth.getSession(); if (!session) { router.push('/auth/login'); return; } await load(); }
    void init();
    const channel = supabase.channel('notification-inbox').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => { void load(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, router, supabase]);

  async function openNotification(notification: Notification) {
    if (!notification.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id);
    if (notification.href) router.push(notification.href); else await load();
  }
  async function markAllRead() { await supabase.rpc('mark_all_notifications_read'); await load(); }
  const unread = notifications.filter(item => !item.read_at).length;

  return <main className="min-h-screen bg-[#07080c] text-white"><div className="fixed inset-0 -z-10 bg-[radial-gradient(ellipse_65%_35%_at_50%_-5%,rgba(34,197,94,0.17),transparent_70%)]" />
    <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6 md:px-8"><Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 hover:text-white"><ArrowLeft size={16} /> Zurück zum Profil</Link><Link href="/tournaments" className="text-sm font-bold text-emerald-200 hover:text-emerald-100">Turniere</Link></nav>
    <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 md:px-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black tracking-[0.2em] text-emerald-200"><Bell size={13} /> NOTIFICATION CENTER</div><h1 className="mt-4 text-5xl font-black tracking-[-0.06em]">Deine Signale.</h1><p className="mt-3 text-zinc-400">Matchrooms, Turniere und wichtige Updates an einem Ort.</p></div>{unread > 0 && <button onClick={() => void markAllRead()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-zinc-300 hover:bg-white/10"><CheckCheck size={16} /> Alle gelesen</button>}</div>
      <div className="mt-9 overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/65 shadow-2xl shadow-black/30">{loading ? <div className="p-12 text-center text-zinc-500">Benachrichtigungen werden geladen …</div> : notifications.length === 0 ? <div className="p-14 text-center"><Bell className="mx-auto mb-4 text-zinc-600" size={34} /><h2 className="text-xl font-black">Alles ruhig.</h2><p className="mt-2 text-sm text-zinc-500">Sobald etwas für dich bereitsteht, findest du es hier.</p></div> : notifications.map(notification => <button key={notification.id} onClick={() => void openNotification(notification)} className={`group flex w-full items-center gap-4 border-b border-white/[0.07] p-5 text-left transition last:border-0 hover:bg-white/[0.045] ${!notification.read_at ? 'bg-emerald-400/[0.045]' : ''}`}><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${notification.type.includes('tournament') ? 'border-amber-300/20 bg-amber-300/10 text-amber-200' : 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200'}`}>{notificationIcon(notification.type)}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate font-black">{notification.title}</h2>{!notification.read_at && <CircleDot size={12} className="shrink-0 text-emerald-300" />}</div>{notification.body && <p className="mt-1 text-sm text-zinc-400">{notification.body}</p>}<p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-600">{relativeTime(notification.created_at)}</p></div><ChevronRight className="shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-white" size={18} /></button>)}</div>
    </section></main>;
}

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Settings2, ShieldCheck, UserRound } from 'lucide-react';

type AccountMenuProps = {
  username: string;
  email: string | null;
  isAdmin: boolean;
  onLogout: () => Promise<void>;
};

export function AccountMenu({ username, email, isAdmin, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await onLogout();
  };

  return (
    <div ref={menuRef} className="fixed right-4 top-4 z-[90] text-white sm:right-6 sm:top-5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex max-w-[min(16rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-white/10 bg-zinc-950/85 py-1.5 pl-2 pr-3 shadow-xl shadow-black/35 backdrop-blur-xl transition hover:border-emerald-300/35 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block truncate text-xs font-black tracking-tight text-zinc-100">{username}</span>
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">Konto</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? 'rotate-180 text-emerald-200' : ''}`} />
      </button>

      {open && (
        <div role="menu" aria-label="Kontomenü" className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#101314]/95 p-2 shadow-2xl shadow-black/55 backdrop-blur-2xl">
          <div className="border-b border-white/8 px-3 pb-3 pt-2">
            <p className="truncate text-sm font-black text-white">{username}</p>
            {email && <p className="mt-1 truncate text-xs text-zinc-500">{email}</p>}
          </div>

          <div className="space-y-1 py-2">
            <Link href="/profile" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.07] hover:text-white">
              <UserRound className="h-4 w-4 text-emerald-200" /> Mein Profil
            </Link>
            <Link href="/account/settings" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-200 transition hover:bg-white/[0.07] hover:text-white">
              <Settings2 className="h-4 w-4 text-cyan-200" /> Einstellungen & Sicherheit
            </Link>
            {isAdmin && (
              <Link href="/admin" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-amber-100 transition hover:bg-amber-300/10 hover:text-amber-50">
                <ShieldCheck className="h-4 w-4 text-amber-300" /> Admin Console
              </Link>
            )}
          </div>

          <div className="border-t border-white/8 pt-2">
            <button type="button" onClick={() => void handleLogout()} disabled={loggingOut} role="menuitem" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-wait disabled:opacity-60">
              <LogOut className="h-4 w-4" /> {loggingOut ? 'Wird abgemeldet …' : 'Ausloggen'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

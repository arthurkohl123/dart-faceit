'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CircleHelp, Code2, LogOut, Settings2, UserRound } from 'lucide-react';

type AccountMenuProps = {
  username: string;
  email: string | null;
  isDeveloper: boolean;
  isNewPlayer: boolean;
  onLogout: () => Promise<void>;
};

export function AccountMenu({ username, email, isDeveloper, isNewPlayer, onLogout }: AccountMenuProps) {
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
    <div ref={menuRef} className="fixed right-16 top-0 z-[90] flex h-[72px] items-center text-white sm:right-6">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group flex h-full max-w-[min(15rem,calc(100vw-5.5rem))] items-center gap-2 border-l border-white/10 py-2 pl-4 pr-1 transition hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/70 sm:pl-5"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-200 transition group-hover:border-emerald-300/50 group-hover:bg-emerald-400/15">
          <UserRound className="h-4 w-4" />
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-xs font-black tracking-tight text-zinc-100">{username}</span>
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-300">Konto</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? 'rotate-180 text-emerald-200' : ''}`} />
      </button>

      {open && (
        <div role="menu" aria-label="Kontomenü" className="absolute right-0 top-[76px] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#101314]/[0.98] p-2 shadow-2xl shadow-black/55 backdrop-blur-2xl">
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
            <Link href="/getting-started" onClick={() => setOpen(false)} role="menuitem" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition hover:text-white ${isNewPlayer ? 'bg-emerald-400/[0.08] text-emerald-100 hover:bg-emerald-400/[0.13]' : 'text-zinc-200 hover:bg-white/[0.07]'}`}>
              <CircleHelp className="h-4 w-4 text-emerald-200" /> {isNewPlayer ? 'Erste Schritte' : 'Spielablauf & Hilfe'}
            </Link>
            {isDeveloper && (
              <Link href="/developer" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/10 hover:text-cyan-50">
                <Code2 className="h-4 w-4 text-cyan-300" /> Developer Workbench
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

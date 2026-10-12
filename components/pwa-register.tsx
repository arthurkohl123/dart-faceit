'use client';

import { useEffect } from 'react';
import { useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => (
    typeof window !== 'undefined' && window.sessionStorage.getItem('rankeddarts-pwa-install-dismissed') === '1'
  ));

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('load', register);
    };
  }, []);

  if (!installEvent || dismissed) return null;

  const install = async () => {
    await installEvent.prompt();
    const result = await installEvent.userChoice;
    if (result.outcome === 'accepted') setInstallEvent(null);
  };

  const dismiss = () => {
    window.sessionStorage.setItem('rankeddarts-pwa-install-dismissed', '1');
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-4 z-[80] mx-auto flex max-w-md items-center gap-3 border border-emerald-300/25 bg-[#0d1613]/95 p-3 text-sm text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="min-w-0 flex-1"><p className="font-black">RankedDarts installieren</p><p className="mt-0.5 truncate text-xs text-zinc-400">Schneller Zugriff wie bei einer App.</p></div>
      <button type="button" onClick={() => void install()} className="shrink-0 bg-emerald-300 px-3 py-2 text-xs font-black text-black">Installieren</button>
      <button type="button" onClick={dismiss} className="shrink-0 px-2 py-2 text-xs font-bold text-zinc-400 hover:text-white">Später</button>
    </div>
  );
}

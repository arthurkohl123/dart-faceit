'use client';

import { useEffect } from 'react';
import { useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const android = /Android/i.test(navigator.userAgent);
    setIsAndroid(android);
    const dismissalKey = android ? 'rankeddarts-android-install-dismissed' : 'rankeddarts-pwa-install-dismissed';
    setDismissed(window.sessionStorage.getItem(dismissalKey) === '1');
    const register = () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };

    // Android users receive the signed APK instead of the browser-generated
    // wrapper that can be flagged as an outdated app by Play Protect.
    if (!android) window.addEventListener('beforeinstallprompt', onInstallPrompt);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => {
      if (!android) window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('load', register);
    };
  }, []);

  if (dismissed || (!isAndroid && !installEvent)) return null;

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const result = await installEvent.userChoice;
    if (result.outcome === 'accepted') setInstallEvent(null);
  };

  const dismiss = () => {
    const dismissalKey = isAndroid ? 'rankeddarts-android-install-dismissed' : 'rankeddarts-pwa-install-dismissed';
    window.sessionStorage.setItem(dismissalKey, '1');
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-4 z-[80] mx-auto flex max-w-md items-center gap-3 border border-emerald-300/25 bg-[#0d1613]/95 p-3 text-sm text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <p className="font-black">{isAndroid ? 'RankedDarts Android-App' : 'RankedDarts installieren'}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-400">{isAndroid ? 'Signierte APK direkt von RankedDarts.' : 'Schneller Zugriff wie bei einer App.'}</p>
      </div>
      {isAndroid ? (
        <a
          href="/download/rankeddarts-android.apk"
          download
          onClick={() => {
            window.sessionStorage.setItem('rankeddarts-android-install-dismissed', '1');
            setDismissed(true);
          }}
          className="shrink-0 bg-emerald-300 px-3 py-2 text-xs font-black text-black"
        >
          APK laden
        </a>
      ) : (
        <button type="button" onClick={() => void install()} className="shrink-0 bg-emerald-300 px-3 py-2 text-xs font-black text-black">Installieren</button>
      )}
      <button type="button" onClick={dismiss} className="shrink-0 px-2 py-2 text-xs font-bold text-zinc-400 hover:text-white">Später</button>
    </div>
  );
}

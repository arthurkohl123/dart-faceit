'use client';

import { useEffect } from 'react';
import { useState } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const INSTALL_DISMISSED_KEY = 'rankeddarts-install-prompt-dismissed-v2';
const LEGACY_DISMISSED_KEYS = [
  'rankeddarts-android-install-dismissed',
  'rankeddarts-pwa-install-dismissed',
];

function hasDismissedInstallPrompt() {
  try {
    if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return true;
    if (LEGACY_DISMISSED_KEYS.some((key) => window.localStorage.getItem(key) === '1')) return true;
    // Older releases used sessionStorage. Migrate that choice so the prompt
    // does not return as soon as the browser session is restarted.
    if (LEGACY_DISMISSED_KEYS.some((key) => window.sessionStorage.getItem(key) === '1')) {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
      return true;
    }
  } catch {
    // Storage can be unavailable in private browsing. The install flow still
    // works; in that case the prompt is only suppressed for the current mount.
  }
  return false;
}

function rememberInstallPromptDismissal() {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // Ignore storage restrictions; state is still updated for this session.
  }
}

export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isAndroid, setIsAndroid] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const android = /Android/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const syncInstallState = () => {
      setIsAndroid(android);
      setDismissed(standalone || hasDismissedInstallPrompt());
    };
    const syncTimer = window.setTimeout(syncInstallState, 0);
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
      window.clearTimeout(syncTimer);
      if (!android) window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('load', register);
    };
  }, []);

  if (dismissed || (!isAndroid && !installEvent)) return null;

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    // Whether the user installs or closes the native prompt, do not interrupt
    // them with the same banner again on the next visit.
    setInstallEvent(null);
    rememberInstallPromptDismissal();
    setDismissed(true);
  };

  const dismiss = () => {
    rememberInstallPromptDismissal();
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
            rememberInstallPromptDismissal();
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


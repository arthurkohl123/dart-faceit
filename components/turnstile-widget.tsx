'use client';
import { useEffect, useRef } from 'react';
declare global { interface Window { turnstile?: { render: (el: HTMLElement, options: Record<string, unknown>) => string; remove?: (id: string) => void } } }
export function TurnstileWidget({ action, onToken }: { action: string; onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null); const id = useRef<string | null>(null); const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const render = () => { if (!ref.current || !window.turnstile || id.current) return; id.current = window.turnstile.render(ref.current, { sitekey: siteKey, action, theme: 'dark', callback: (token: string) => onToken(token), 'expired-callback': () => onToken(null), 'error-callback': () => onToken(null) }); };
    const existing = document.querySelector<HTMLScriptElement>('script[data-rankeddarts-turnstile]');
    if (existing) { existing.addEventListener('load', render); render(); } else { const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true; script.dataset.rankeddartsTurnstile = 'true'; script.addEventListener('load', render); document.head.appendChild(script); }
    return () => { if (id.current && window.turnstile?.remove) window.turnstile.remove(id.current); id.current = null; };
  }, [action, onToken, siteKey]);
  return siteKey ? <div ref={ref} className="min-h-[65px]" aria-label="Sicherheitsprüfung" /> : null;
}

export async function verifyCaptcha(action: string, token: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return { ok: true };
  if (!token) return { ok: false, error: 'Bitte bestätige zuerst die Sicherheitsprüfung.' };
  const response = await fetch('/api/security/captcha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token }) });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return response.ok ? { ok: true } : { ok: false, error: payload?.error || 'Sicherheitsprüfung fehlgeschlagen.' };
}

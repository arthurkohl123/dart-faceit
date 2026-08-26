import { NextResponse } from 'next/server';
import { verifyTurnstileToken } from '@/lib/captcha';
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: unknown; token?: unknown } | null;
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const token = typeof body?.token === 'string' ? body.token : null;
  if (!['register', 'login', 'support', 'checkout'].includes(action) || !token) return NextResponse.json({ error: 'Ungültige Sicherheitsprüfung.' }, { status: 400 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip');
  const result = await verifyTurnstileToken(token, ip);
  if (!result.success) return NextResponse.json({ error: 'Sicherheitsprüfung fehlgeschlagen.' }, { status: 403 });
  return NextResponse.json({ ok: true, configured: result.configured });
}

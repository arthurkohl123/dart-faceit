export type CaptchaVerification = {
  configured: boolean;
  success: boolean;
  errorCodes?: string[];
};

/** Verify a Cloudflare Turnstile token without exposing the secret to clients. */
export async function verifyTurnstileToken(token: string | null | undefined, remoteIp?: string | null): Promise<CaptchaVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { configured: false, success: true };
  if (!token?.trim()) return { configured: true, success: false, errorCodes: ['missing-input-response'] };

  const body = new URLSearchParams({ secret, response: token.trim() });
  if (remoteIp?.trim()) body.set('remoteip', remoteIp.trim());

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const result = await response.json() as { success?: boolean; 'error-codes'?: string[] };
    return { configured: true, success: response.ok && result.success === true, errorCodes: result['error-codes'] };
  } catch {
    return { configured: true, success: false, errorCodes: ['verification-unavailable'] };
  }
}

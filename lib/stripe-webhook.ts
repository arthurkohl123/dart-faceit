import { createHmac, timingSafeEqual } from 'node:crypto';

const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  nowMs = Date.now(),
): boolean {
  const parts = signatureHeader.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator === -1 ? [part, ''] : [part.slice(0, separator), part.slice(separator + 1)];
  });
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value)
    .filter(Boolean);
  const timestampNumber = Number(timestamp);

  if (
    !timestamp
    || !Number.isFinite(timestampNumber)
    || signatures.length === 0
    || Math.abs(Math.floor(nowMs / 1000) - timestampNumber) > STRIPE_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expected = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((candidate) => {
    if (!/^[a-f\d]{64}$/i.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, 'hex');
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}

'use client';

export function reportClientError(
  eventType: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  void fetch('/api/monitoring/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType, message, context }),
    keepalive: true,
  }).catch(() => undefined);
}


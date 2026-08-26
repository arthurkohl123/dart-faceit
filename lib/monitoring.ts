import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase-admin';
export { monitoringErrorMessage } from '@/lib/monitoring-utils';

export type MonitoringSeverity = 'info' | 'warning' | 'error' | 'critical';

type MonitoringInput = {
  source: string;
  eventType: string;
  severity: MonitoringSeverity;
  message: string;
  context?: Record<string, unknown>;
  fingerprint?: string;
};

function monitoringFingerprint(input: MonitoringInput) {
  if (input.fingerprint) return input.fingerprint.slice(0, 160);
  return createHash('sha256')
    .update(`${input.source}:${input.eventType}:${input.message}`)
    .digest('hex');
}

export async function recordMonitoringEvent(input: MonitoringInput): Promise<void> {
  try {
    const { data, error } = await createAdminClient().rpc('record_monitoring_event', {
      p_source: input.source.slice(0, 50),
      p_event_type: input.eventType.slice(0, 80),
      p_severity: input.severity,
      p_message: input.message.slice(0, 1000),
      p_fingerprint: monitoringFingerprint(input),
      p_context: input.context ?? {},
    });

    if (error) throw error;

    const result = data as { is_new?: boolean } | null;
    const alertUrl = process.env.MONITORING_ALERT_WEBHOOK_URL;
    if (alertUrl && result?.is_new && (input.severity === 'error' || input.severity === 'critical')) {
      await fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `[RankedDarts ${input.severity.toUpperCase()}] ${input.source}: ${input.message}`,
          text: `[RankedDarts ${input.severity.toUpperCase()}] ${input.source}: ${input.message}`,
        }),
        signal: AbortSignal.timeout(4_000),
      }).catch(() => undefined);
    }
  } catch (monitoringError) {
    // Monitoring must never turn the original recoverable error into an outage.
    console.error('Monitoring event could not be stored:', monitoringError);
  }
}

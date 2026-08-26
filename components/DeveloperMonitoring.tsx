'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Check, CircleAlert, Clock3, CreditCard, Database, RefreshCcw, Server, ShieldAlert, Webhook } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type HealthState = 'ok' | 'degraded' | 'down';
type HealthCheck = { status: HealthState; latencyMs: number; message?: string };
type HealthPayload = {
  status: HealthState;
  checkedAt: string;
  environment: string;
  region: string;
  commit: string | null;
  checks: { database: HealthCheck; stripe: HealthCheck; deployment: HealthCheck };
};

type MonitoringMetrics = {
  errors_24h: number;
  unresolved: number;
  checkout_errors_24h: number;
  cancelled_matches_1h: number;
  cancelled_matches_24h: number;
};

type MonitoringEvent = {
  id: string;
  source: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  context: Record<string, unknown>;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};

type MonitoringPayload = { metrics?: Partial<MonitoringMetrics>; events?: MonitoringEvent[] };

const emptyMetrics: MonitoringMetrics = {
  errors_24h: 0,
  unresolved: 0,
  checkout_errors_24h: 0,
  cancelled_matches_1h: 0,
  cancelled_matches_24h: 0,
};

const severityStyle = {
  info: 'border-sky-300/20 bg-sky-400/10 text-sky-200',
  warning: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
  error: 'border-red-300/25 bg-red-500/10 text-red-100',
  critical: 'border-fuchsia-300/25 bg-fuchsia-500/10 text-fuchsia-100',
};

function healthStyle(status?: HealthState) {
  if (status === 'ok') return 'border-emerald-300/20 bg-emerald-400/[0.07] text-emerald-100';
  if (status === 'degraded') return 'border-amber-300/20 bg-amber-400/[0.07] text-amber-100';
  return 'border-red-300/25 bg-red-500/[0.08] text-red-100';
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function DeveloperMonitoring() {
  const supabase = useMemo(() => createClient(), []);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetrics>(emptyMetrics);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    const [healthResult, monitoringResult] = await Promise.all([
      fetch('/api/health', { cache: 'no-store' }).then(async (response) => ({
        ok: response.ok,
        data: await response.json().catch(() => null) as HealthPayload | null,
      })).catch(() => ({ ok: false, data: null })),
      supabase.rpc('dev_get_monitoring_dashboard', { p_limit: 50 }),
    ]);

    if (healthResult.data) setHealth(healthResult.data);
    if (monitoringResult.error) {
      setError(`Monitoring konnte nicht geladen werden: ${monitoringResult.error.message}`);
    } else {
      const payload = monitoringResult.data as MonitoringPayload | null;
      setMetrics({ ...emptyMetrics, ...(payload?.metrics ?? {}) });
      setEvents(payload?.events ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  const resolveEvent = async (eventId: string) => {
    setResolving(eventId);
    const { error: resolveError } = await supabase.rpc('dev_resolve_monitoring_event', { p_event_id: eventId });
    setResolving(null);
    if (resolveError) setError(resolveError.message);
    else await load();
  };

  const cancellationSpike = metrics.cancelled_matches_1h >= 5 || metrics.cancelled_matches_24h >= 15;
  const services = [
    { key: 'database', label: 'Supabase', icon: Database, check: health?.checks.database },
    { key: 'stripe', label: 'Stripe', icon: CreditCard, check: health?.checks.stripe },
    { key: 'deployment', label: 'Vercel', icon: Server, check: health?.checks.deployment },
  ] as const;

  return (
    <section id="monitoring" className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(8,47,73,0.22),rgba(9,9,11,0.88)_48%,rgba(63,63,70,0.18))] shadow-2xl shadow-black/30">
      <div className="flex flex-col gap-4 border-b border-white/10 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
            <Activity className="h-3.5 w-3.5" /> Production Observatory
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Monitoring & Fehlerzentrale</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Live-Status von Supabase, Stripe und Vercel sowie deduplizierte Produktionsfehler und Match-Abbruchwarnungen.</p>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.09]">
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Live prüfen
        </button>
      </div>

      {error && <div className="m-6 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div>}

      <div className="grid gap-3 p-6 sm:grid-cols-3">
        {services.map(({ key, label, icon: Icon, check }) => (
          <div key={key} className={`rounded-3xl border p-5 ${healthStyle(check?.status)}`}>
            <div className="flex items-center justify-between gap-3"><Icon className="h-5 w-5" /><span className="text-[10px] font-black uppercase tracking-[0.16em]">{check?.status ?? 'prüft'}</span></div>
            <div className="mt-4 text-xl font-black">{label}</div>
            <div className="mt-1 text-xs opacity-70">{check ? `${check.latencyMs} ms${check.message ? ` · ${check.message}` : ''}` : 'Status wird geladen'}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-y border-white/10 bg-black/20 p-6 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Fehler / 24h', value: metrics.errors_24h, icon: ShieldAlert, alert: metrics.errors_24h > 0 },
          { label: 'Offen', value: metrics.unresolved, icon: CircleAlert, alert: metrics.unresolved > 0 },
          { label: 'Payment / 24h', value: metrics.checkout_errors_24h, icon: Webhook, alert: metrics.checkout_errors_24h > 0 },
          { label: 'Abbrüche / 1h', value: metrics.cancelled_matches_1h, icon: Clock3, alert: metrics.cancelled_matches_1h >= 5 },
          { label: 'Abbrüche / 24h', value: metrics.cancelled_matches_24h, icon: AlertTriangle, alert: metrics.cancelled_matches_24h >= 15 },
        ].map(({ label, value, icon: Icon, alert }) => (
          <div key={label} className={`rounded-2xl border p-4 ${alert ? 'border-red-300/25 bg-red-500/10' : 'border-white/10 bg-white/[0.035]'}`}>
            <Icon className={`h-4 w-4 ${alert ? 'text-red-200' : 'text-zinc-400'}`} />
            <div className="mt-3 text-3xl font-black">{value}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      {cancellationSpike && (
        <div className="mx-6 mt-6 flex gap-3 rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><div className="font-black">Ungewöhnliche Match-Abbruchrate</div><p className="mt-1 text-red-100/75">Grenzwert: 5 Abbrüche pro Stunde oder 15 innerhalb von 24 Stunden. Matchmaking und No-Show-Abläufe sollten geprüft werden.</p></div>
        </div>
      )}

      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-xl font-black">Letzte Ereignisse</h3><p className="mt-1 text-xs text-zinc-500">Gleiche Fehler werden in Fünf-Minuten-Fenstern zusammengefasst.</p></div>
          {health && <div className="text-right text-[10px] font-black uppercase tracking-[0.13em] text-zinc-500">{health.environment} · {health.region}{health.commit ? ` · ${health.commit}` : ''}</div>}
        </div>

        <div className="mt-5 space-y-3">
          {!events.length ? (
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[0.05] p-6 text-center text-sm font-bold text-emerald-100"><Check className="mx-auto mb-2 h-5 w-5" />Keine Monitoring-Ereignisse vorhanden.</div>
          ) : events.map((event) => (
            <article key={event.id} className={`rounded-2xl border p-4 ${event.resolved_at ? 'border-white/5 bg-white/[0.02] opacity-55' : 'border-white/10 bg-black/25'}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${severityStyle[event.severity]}`}>{event.severity}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">{event.source} · {event.event_type}</span>
                    {event.occurrence_count > 1 && <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-black text-zinc-300">×{event.occurrence_count}</span>}
                  </div>
                  <p className="mt-3 break-words text-sm font-bold text-zinc-100">{event.message}</p>
                  <p className="mt-2 text-[11px] text-zinc-500">Zuletzt: {formatDate(event.last_seen_at)}{event.resolved_at ? ` · erledigt ${formatDate(event.resolved_at)}` : ''}</p>
                </div>
                {!event.resolved_at && (
                  <button type="button" disabled={resolving === event.id} onClick={() => void resolveEvent(event.id)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> {resolving === event.id ? 'Speichert…' : 'Erledigt'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}


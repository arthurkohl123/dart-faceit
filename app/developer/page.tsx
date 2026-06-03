'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Database, RefreshCcw, Save, Shield, SlidersHorizontal, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type DashboardStats = {
  profiles?: number;
  banned_profiles?: number;
  queue_locked_profiles?: number;
  open_matches?: number;
  queue_entries?: number;
};

type DashboardPayload = {
  settings?: Record<string, unknown>;
  stats?: DashboardStats;
};

type MaintenanceSetting = {
  enabled?: boolean;
  message?: string;
};

type BanMinutesSetting = {
  minutes?: number;
};

type DeveloperNoticeSetting = {
  message?: string;
};

type SmsVerificationSetting = {
  enabled?: boolean;
};

function getObjectSetting<T extends object>(settings: Record<string, unknown> | undefined, key: string): T {
  const value = settings?.[key];
  return value && typeof value === 'object' ? value as T : {} as T;
}

export default function DeveloperDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stats, setStats] = useState<DashboardStats>({});
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('RankedDarts wird gerade aktualisiert. Bitte versuche es gleich erneut.');
  const [noShowBanMinutes, setNoShowBanMinutes] = useState(15);
  const [smsVerificationEnabled, setSmsVerificationEnabled] = useState(true);
  const [developerNotice, setDeveloperNotice] = useState('');

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError('');
    window.setTimeout(() => setSuccess(''), 3500);
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace('/auth/login?redirectTo=/developer');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_developer')
      .eq('supabaseId', userData.user.id)
      .single();

    if (!profile?.is_developer) {
      router.replace('/');
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('dev_get_dashboard');
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const payload = data as DashboardPayload | null;
    const settings = payload?.settings;
    const maintenance = getObjectSetting<MaintenanceSetting>(settings, 'maintenance_mode');
    const banMinutes = getObjectSetting<BanMinutesSetting>(settings, 'no_show_queue_ban_minutes');
    const smsVerification = getObjectSetting<SmsVerificationSetting>(settings, 'sms_verification');
    const notice = getObjectSetting<DeveloperNoticeSetting>(settings, 'developer_notice');

    setStats(payload?.stats ?? {});
    setMaintenanceEnabled(Boolean(maintenance.enabled));
    setMaintenanceMessage(maintenance.message ?? 'RankedDarts wird gerade aktualisiert. Bitte versuche es gleich erneut.');
    setNoShowBanMinutes(Number(banMinutes.minutes ?? 15));
    setSmsVerificationEnabled(smsVerification.enabled !== false);
    setDeveloperNotice(notice.message ?? '');
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const updateSetting = async (key: string, value: Record<string, unknown>, successMessage: string) => {
    setSaving(key);
    setError('');

    const { error: rpcError } = await supabase.rpc('dev_update_setting', {
      p_key: key,
      p_value: value,
    });

    setSaving(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    showSuccess(successMessage);
    void loadDashboard();
  };

  const clearExpiredQueueLocks = async () => {
    setSaving('clear_locks');
    setError('');

    const { data, error: rpcError } = await supabase.rpc('dev_clear_expired_queue_locks');
    setSaving(null);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const result = data as { cleared?: number } | null;
    showSuccess(`${result?.cleared ?? 0} abgelaufene Queue-Sperren bereinigt.`);
    void loadDashboard();
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050507] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <RefreshCcw className="mx-auto h-7 w-7 animate-spin text-cyan-300" />
          <p className="mt-4 text-sm font-bold text-zinc-300">Developer-Oberfläche wird geladen…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.12),transparent_32%)]" />
      <section className="relative mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
              <Shield className="h-4 w-4" /> Developer Control Center
            </div>
            <h1 className="mt-6 text-5xl font-black tracking-[-0.07em] md:text-7xl">RankedDarts Steuerung</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
              Diese Oberfläche ist für technische Eingriffe gedacht. Du kannst hier den Wartungsmodus schalten, No-Show-Strafen einstellen, die SMS-Verifizierung aktivieren oder deaktivieren und operative Kennzahlen prüfen.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void loadDashboard()} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.08]">
              Aktualisieren
            </button>
            <Link href="/admin" className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-black text-black transition hover:bg-zinc-200">
              Admin öffnen
            </Link>
          </div>
        </div>

        {(error || success) && (
          <div className={`mt-6 flex items-center gap-3 rounded-3xl border px-5 py-4 text-sm font-bold ${error ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'}`}>
            {error ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            {error || success}
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Activity className="h-5 w-5 text-emerald-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.profiles ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Profile</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Shield className="h-5 w-5 text-red-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.banned_profiles ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Account-Bans</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Clock className="h-5 w-5 text-amber-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.queue_locked_profiles ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Queue-Sperren</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <Database className="h-5 w-5 text-cyan-300" />
            <p className="mt-4 text-4xl font-black tracking-[-0.05em]">{stats.open_matches ?? 0}</p>
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-zinc-500">Offene Matches</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
                  <Wrench className="h-3.5 w-3.5" /> Wartungsmodus
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Website temporär sperren</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Wenn aktiv, werden normale Nutzer auf die Wartungsseite weitergeleitet. Developer bleiben eingeloggt und können den Modus wieder deaktivieren.</p>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceEnabled((value) => !value)}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${maintenanceEnabled ? 'border border-amber-300/30 bg-amber-400/15 text-amber-100' : 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-100'}`}
              >
                {maintenanceEnabled ? 'Aktiv' : 'Aus'}
              </button>
            </div>

            <label className="mt-6 block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Wartungstext</label>
            <textarea
              value={maintenanceMessage}
              onChange={(event) => setMaintenanceMessage(event.target.value)}
              rows={4}
              className="mt-3 w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-300/40"
            />

            <button
              type="button"
              disabled={saving === 'maintenance_mode'}
              onClick={() => void updateSetting('maintenance_mode', { enabled: maintenanceEnabled, message: maintenanceMessage }, maintenanceEnabled ? 'Wartungsmodus aktiviert.' : 'Wartungsmodus deaktiviert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-5 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving === 'maintenance_mode' ? 'Speichert…' : 'Wartungsmodus speichern'}
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
              <SlidersHorizontal className="h-3.5 w-3.5" /> No-Show Regeln
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Queue-Sperre nach No-Show</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Diese Minutenanzahl wird verwendet, wenn ein Spieler nach Ablauf der 5-Minuten-No-Show-Frist automatisch gesperrt wird.</p>

            <label className="mt-6 block text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Sperrdauer in Minuten</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={noShowBanMinutes}
              onChange={(event) => setNoShowBanMinutes(Number(event.target.value))}
              className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-zinc-100 outline-none transition focus:border-cyan-300/40"
            />

            <button
              type="button"
              disabled={saving === 'no_show_queue_ban_minutes'}
              onClick={() => void updateSetting('no_show_queue_ban_minutes', { minutes: Math.max(1, noShowBanMinutes) }, 'No-Show-Sperrdauer gespeichert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving === 'no_show_queue_ban_minutes' ? 'Speichert…' : 'Sperrdauer speichern'}
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
                  <Shield className="h-3.5 w-3.5" /> SMS-Verifizierung
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Telefon-Verifizierung steuern</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Wenn deaktiviert, dürfen Nutzer Matchmaking auch ohne bestätigte Telefonnummer verwenden. Neue Registrierungen werden dann automatisch als telefonisch verifiziert markiert.</p>
              </div>
              <button
                type="button"
                onClick={() => setSmsVerificationEnabled((value) => !value)}
                className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${smsVerificationEnabled ? 'border border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border border-zinc-500/30 bg-zinc-500/10 text-zinc-200'}`}
              >
                {smsVerificationEnabled ? 'Aktiv' : 'Aus'}
              </button>
            </div>

            <button
              type="button"
              disabled={saving === 'sms_verification'}
              onClick={() => void updateSetting('sms_verification', { enabled: smsVerificationEnabled }, smsVerificationEnabled ? 'SMS-Verifizierung aktiviert.' : 'SMS-Verifizierung deaktiviert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving === 'sms_verification' ? 'Speichert…' : 'SMS-Einstellung speichern'}
            </button>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-violet-200">
              <AlertTriangle className="h-3.5 w-3.5" /> Developer Notice
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Interne Notiz speichern</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Nutze dieses Feld für kurze technische Hinweise, Deploy-Notizen oder To-dos. Die Notiz wird in `app_settings` gespeichert.</p>
            <textarea
              value={developerNotice}
              onChange={(event) => setDeveloperNotice(event.target.value)}
              rows={4}
              placeholder="z. B. Nach Deployment SQL-Migration prüfen…"
              className="mt-5 w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-300/40"
            />
            <button
              type="button"
              disabled={saving === 'developer_notice'}
              onClick={() => void updateSetting('developer_notice', { message: developerNotice }, 'Developer-Notiz gespeichert.')}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/10 px-5 py-3 text-sm font-black text-violet-100 transition hover:bg-violet-400/15 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Notiz speichern
            </button>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
              <Database className="h-3.5 w-3.5" /> Wartungsaktionen
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Sichere Hilfsfunktionen</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Diese Aktionen sind bewusst nicht destruktiv. Sie räumen nur abgelaufene Sperren auf oder führen zu vorhandenen Admin-Bereichen.</p>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                disabled={saving === 'clear_locks'}
                onClick={() => void clearExpiredQueueLocks()}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-left text-sm font-black text-zinc-100 transition hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span>Abgelaufene Queue-Sperren bereinigen</span>
                <RefreshCcw className={`h-4 w-4 ${saving === 'clear_locks' ? 'animate-spin' : ''}`} />
              </button>
              <Link href="/support" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.06]">
                Support-Tickets prüfen
                <span className="text-zinc-500">öffnen</span>
              </Link>
              <Link href="/matchmaking" className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-white/[0.06]">
                Matchmaking testen
                <span className="text-zinc-500">öffnen</span>
              </Link>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

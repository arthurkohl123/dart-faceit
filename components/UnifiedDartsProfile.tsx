import { Activity, BarChart3, CheckCircle2, Trophy, Zap } from 'lucide-react';

export type DartsPlatform = 'scolia' | 'dartcounter' | 'autodarts';

export type PlatformStatistic = {
  app: DartsPlatform;
  match_count: number;
  wins: number;
  average: number | null;
  best_average: number | null;
  total_180s: number;
  last_played_at: string | null;
};

type Props = {
  statistics: PlatformStatistic[];
  connectedApps?: DartsPlatform[];
  compact?: boolean;
};

const platforms: Array<{
  app: DartsPlatform;
  label: string;
  description: string;
  accent: string;
  surface: string;
}> = [
  { app: 'scolia', label: 'Scolia', description: 'Kamera-Tracking', accent: 'text-emerald-300', surface: 'border-emerald-300/20 bg-emerald-400/[0.045]' },
  { app: 'dartcounter', label: 'DartCounter', description: 'App-Tracking', accent: 'text-cyan-300', surface: 'border-cyan-300/20 bg-cyan-400/[0.045]' },
  { app: 'autodarts', label: 'AutoDarts', description: 'Automatisches Tracking', accent: 'text-violet-300', surface: 'border-violet-300/20 bg-violet-400/[0.045]' },
];

function number(value: number | null | undefined) {
  return value && value > 0 ? value.toFixed(1) : '—';
}

export function PlatformBadge({ app }: { app: DartsPlatform | string | null | undefined }) {
  const platform = platforms.find((item) => item.app === app);
  if (!platform) return null;

  return (
    <span className={`shrink-0 border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${platform.surface} ${platform.accent}`}>
      {platform.label}
    </span>
  );
}

export function UnifiedDartsProfile({ statistics, connectedApps = [], compact = false }: Props) {
  const statsByApp = new Map(statistics.map((stat) => [stat.app, stat]));
  const activePlatforms = statistics.filter((stat) => stat.match_count > 0).length;
  const totalMatches = statistics.reduce((sum, stat) => sum + Number(stat.match_count || 0), 0);
  const totalWins = statistics.reduce((sum, stat) => sum + Number(stat.wins || 0), 0);
  const total180s = statistics.reduce((sum, stat) => sum + Number(stat.total_180s || 0), 0);
  const overallWinrate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
  const primaryPlatform = [...statistics].sort((a, b) => b.match_count - a.match_count)[0];
  const bestPlatform = [...statistics]
    .filter((stat) => stat.best_average !== null)
    .sort((a, b) => Number(b.best_average) - Number(a.best_average))[0];

  return (
    <section className="overflow-hidden border border-white/10 bg-[#0d1110]">
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-7 sm:py-6">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">
            <Activity className="h-3.5 w-3.5" /> Unified Darts Profile
          </div>
          <h2 className="mt-1.5 text-2xl font-black tracking-[-0.045em] sm:text-3xl">Plattformübergreifende Leistung</h2>
          <p className="mt-1 text-sm text-zinc-400">Bestätigte RankedDarts-Ergebnisse, getrennt nach Spielplattform.</p>
        </div>
        <div className="flex gap-2">
          <span className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-black text-zinc-300">{activePlatforms}/3 aktiv</span>
          <span className="border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-black text-emerald-100">{totalMatches} Ranked</span>
        </div>
      </div>

      {!compact && (
        <div className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4">
          <div className="border-r border-white/10 px-4 py-4 text-center sm:px-6">
            <div className="text-xl font-black text-white sm:text-2xl">{overallWinrate}%</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Gesamt-Winrate</div>
          </div>
          <div className="border-r border-white/10 px-4 py-4 text-center sm:px-6">
            <div className="text-xl font-black text-amber-200 sm:text-2xl">{total180s}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">180er gesamt</div>
          </div>
          <div className="px-4 py-4 text-center sm:px-6">
            <div className="text-xl font-black text-emerald-300 sm:text-2xl">{totalWins}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Siege gesamt</div>
          </div>
          <div className="border-l border-t border-white/10 px-4 py-4 text-center sm:border-t-0 sm:px-6">
            <div className="truncate text-sm font-black text-zinc-100 sm:text-base">{primaryPlatform ? platforms.find((item) => item.app === primaryPlatform.app)?.label : '—'}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Hauptplattform</div>
          </div>
        </div>
      )}

      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        {platforms.map((platform) => {
          const stat = statsByApp.get(platform.app);
          const isConnected = connectedApps.includes(platform.app);
          const hasActivity = Boolean(stat && stat.match_count > 0);
          const winrate = stat && stat.match_count > 0 ? Math.round((stat.wins / stat.match_count) * 100) : 0;

          return (
            <article key={platform.app} className={`border p-4 ${hasActivity || isConnected ? platform.surface : 'border-white/10 bg-white/[0.02]'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`text-sm font-black ${platform.accent}`}>{platform.label}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{platform.description}</div>
                </div>
                {isConnected ? <CheckCircle2 className={`h-4 w-4 ${platform.accent}`} /> : hasActivity ? <Trophy className={`h-4 w-4 ${platform.accent}`} /> : <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">—</span>}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
                <div>
                  <div className="text-xl font-black text-white">{stat?.match_count ?? 0}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Matches</div>
                </div>
                <div>
                  <div className={`text-xl font-black ${platform.accent}`}>{number(stat?.average)}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Ø Average</div>
                </div>
                <div>
                  <div className="text-sm font-black text-zinc-200">{hasActivity ? `${winrate}%` : '—'}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Winrate</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-sm font-black text-amber-200"><Zap className="h-3.5 w-3.5 fill-current" />{stat?.total_180s ?? 0}</div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">180er</div>
                </div>
              </div>
              {hasActivity ? (
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-zinc-500">
                  <span>Best: <span className="font-bold text-zinc-300">Ø {number(stat?.best_average)}</span></span>
                  {bestPlatform?.app === platform.app && <span className={`font-black uppercase tracking-wide ${platform.accent}`}>Top</span>}
                </div>
              ) : isConnected ? (
                <div className="mt-4 border-t border-white/10 pt-3 text-[11px] text-zinc-500">Bereit für das erste Ranked-Match.</div>
              ) : (
                <div className="mt-4 border-t border-white/10 pt-3 text-[11px] text-zinc-600">Noch nicht verbunden.</div>
              )}
            </article>
          );
        })}
      </div>

      <div className="flex items-start gap-2 border-t border-white/10 bg-black/15 px-5 py-3 text-[11px] leading-5 text-zinc-500 sm:px-7">
        <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
        Private Freundschaftsduelle und nicht bestätigte Ergebnisse fließen nicht in diese Werte ein.
      </div>
    </section>
  );
}

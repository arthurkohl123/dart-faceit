import { Clock3, Radio, ShieldCheck, Sparkles, Target, Wrench } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type MaintenanceSetting = {
  message?: string;
};

export const dynamic = 'force-dynamic';

const DEFAULT_MAINTENANCE_MESSAGE = 'RankedDarts wird gerade aktualisiert. Bitte versuche es gleich erneut.';

export default async function MaintenancePage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'maintenance_mode')
    .maybeSingle();

  const savedMessage = (data?.value as MaintenanceSetting | null)?.message?.trim();
  const maintenanceMessage = savedMessage || DEFAULT_MAINTENANCE_MESSAGE;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050609] text-white selection:bg-amber-300 selection:text-black">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:radial-gradient(ellipse_80%_75%_at_50%_45%,black,transparent)]" />
      <div className="pointer-events-none absolute -left-32 top-[-15rem] h-[36rem] w-[36rem] rounded-full bg-amber-400/15 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 bottom-[-18rem] h-[38rem] w-[38rem] rounded-full bg-cyan-400/10 blur-[150px]" />

      <section className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-5 py-12 sm:px-8 lg:px-12">
        <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5 sm:mb-12">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber-300/25 bg-amber-400/10 text-amber-200 shadow-[0_0_35px_rgba(251,191,36,0.14)]">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">RankedDarts</p>
              <p className="mt-0.5 text-sm font-black tracking-tight text-zinc-100">Arena Status</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-200" /></span>
            Geplante Wartung
          </div>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
              <Wrench className="h-3.5 w-3.5 text-amber-200" /> Plattform-Upgrade läuft
            </div>
            <h1 className="mt-7 text-5xl font-black leading-[0.9] tracking-[-0.075em] text-white sm:text-7xl xl:text-8xl">
              Die Arena wird <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-orange-300 bg-clip-text text-transparent">geschärft.</span>
            </h1>
            <p className="mt-8 max-w-2xl border-l-2 border-amber-300/70 pl-5 text-lg leading-8 text-zinc-300 sm:text-xl">
              {maintenanceMessage}
            </p>

            <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
              <div className="group rounded-3xl border border-emerald-300/15 bg-emerald-400/[0.055] p-5 shadow-[inset_0_1px_rgba(255,255,255,0.04)]">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                <h2 className="mt-4 text-base font-black tracking-tight text-zinc-100">Dein Fortschritt bleibt sicher</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Accounts, Elo, Matches und Tickets bleiben vollständig erhalten.</p>
              </div>
              <div className="group rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.045] p-5 shadow-[inset_0_1px_rgba(255,255,255,0.04)]">
                <Clock3 className="h-5 w-5 text-cyan-300" />
                <h2 className="mt-4 text-base font-black tracking-tight text-zinc-100">Kurz offline, stärker zurück</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Wir schalten die Arena wieder frei, sobald alles bereit ist.</p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3 text-xs font-bold text-zinc-500">
              <Radio className="h-4 w-4 text-emerald-300" />
              <span>Systemstatus wird aktiv überwacht.</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-8 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="relative aspect-square rounded-[2.8rem] border border-white/10 bg-[#0a0c10]/80 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7">
              <div className="absolute inset-0 overflow-hidden rounded-[2.8rem]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/70 to-transparent" />
                <div className="absolute -left-20 top-16 h-px w-[130%] rotate-[-24deg] bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />
              </div>
              <div className="relative grid h-full place-items-center overflow-hidden rounded-[2rem] border border-white/[0.07] bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.16),transparent_20%),radial-gradient(circle_at_center,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:auto,18px_18px]">
                <div className="ranked-dartboard absolute h-[78%] w-[78%] rounded-full border border-amber-200/25" />
                <div className="absolute h-[56%] w-[56%] rounded-full border border-amber-200/15" />
                <div className="absolute h-[32%] w-[32%] rounded-full border border-amber-200/20 bg-amber-400/[0.06]" />
                <div className="relative grid h-24 w-24 place-items-center rounded-[2rem] border border-amber-200/35 bg-[#14110b]/90 text-center shadow-[0_0_45px_rgba(251,191,36,0.22)]">
                  <Sparkles className="h-8 w-8 text-amber-200" />
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">Upgrade</span>
                </div>
                <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Arena Node</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">Im Service</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-12 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600 lg:text-left">RankedDarts · Competitive Darts Platform</p>
      </section>
    </main>
  );
}

import { CheckCircle2, MessageCircle, ShieldCheck, Target } from 'lucide-react';

export function ResultRoomPreview({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      <div className="absolute -inset-8 rounded-[3rem] bg-emerald-400/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#090b0d]/95 p-3 shadow-[0_35px_100px_rgba(0,0,0,.65)] backdrop-blur-xl sm:rounded-[2.5rem] sm:p-4">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
        <div className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-zinc-950/90 sm:rounded-[2rem]">
          <div className="flex flex-col gap-3 border-b border-white/10 bg-white/[.025] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" /> Result Room</div>
              <p className="mt-1 text-lg font-black tracking-tight sm:text-xl">Ergebnis eintragen</p>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.1em] text-zinc-600 sm:text-[10px]"><span className="text-emerald-300">01 Match</span><span>›</span><span className="text-white">02 Ergebnis</span><span>›</span><span>03 Wertung</span></div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_3.3rem_minmax(0,1fr)] border-b border-white/10 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)]">
            <Player accent="emerald" role="Du" initial="C" name="CheckoutKing" elo="1284" platform="DC · CheckoutK" />
            <div className="flex flex-col items-center justify-center border-x border-white/10 bg-black/25"><div className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black sm:h-12 sm:w-12"><Target className="h-4 w-4 text-emerald-300 sm:h-5 sm:w-5" /></div><span className="mt-1.5 text-[9px] font-black text-zinc-600">VS</span></div>
            <Player accent="cyan" role="Gegner" initial="T" name="TripleTwenty" elo="1271" platform="DC · Triple20" />
          </div>

          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-zinc-500">Best of 7</p><p className="mt-1 text-sm font-bold text-zinc-300">Endstand</p></div><span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black text-emerald-200">BEREIT ZUR BESTÄTIGUNG</span></div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 text-center"><div><p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Deine Legs</p><p className="mt-1 text-5xl font-black leading-none text-emerald-300 sm:text-6xl">4</p></div><span className="text-xl font-black text-zinc-700">:</span><div><p className="text-[9px] font-black uppercase tracking-wider text-cyan-300">Gegner Legs</p><p className="mt-1 text-5xl font-black leading-none text-zinc-200 sm:text-6xl">2</p></div></div>
            <div className="mt-3 grid grid-cols-2 gap-3"><Stats title="CheckoutKing" average="84.70" oneEighties="2" accent="text-emerald-300" /><Stats title="TripleTwenty" average="81.35" oneEighties="1" accent="text-cyan-300" /></div>
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300"><ShieldCheck className="h-4 w-4" /></div><div><p className="text-xs font-black text-zinc-200">Beide Spieler prüfen das Ergebnis</p><p className="mt-0.5 text-[10px] leading-4 text-zinc-500">Erst nach der Bestätigung wird Elo vergeben.</p></div></div><button type="button" onClick={onOpen} className="rounded-xl bg-emerald-300 px-4 py-2.5 text-xs font-black text-black transition hover:bg-emerald-200">Matchmaking öffnen</button></div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between px-2 text-[10px] font-bold text-zinc-600"><span className="inline-flex items-center gap-1.5"><MessageCircle className="h-3 w-3" /> Matchroom-Chat inklusive</span><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Beispielansicht</span></div>
      </div>
    </div>
  );
}

function Player({ accent, role, initial, name, elo, platform }: { accent: 'emerald' | 'cyan'; role: string; initial: string; name: string; elo: string; platform: string }) {
  const tone = accent === 'emerald' ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200' : 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200';
  return <div className="flex min-w-0 flex-col items-center px-2 py-5 text-center sm:px-5 sm:py-7"><div className={`grid h-11 w-11 place-items-center rounded-2xl border text-lg font-black sm:h-14 sm:w-14 ${tone}`}>{initial}</div><span className={`mt-2.5 text-[9px] font-black uppercase tracking-[.2em] ${accent === 'emerald' ? 'text-emerald-300' : 'text-cyan-300'}`}>{role}</span><p className="mt-1 w-full truncate text-sm font-black sm:text-lg">{name}</p><p className="mt-1 text-[10px] font-bold text-zinc-500">{elo} Elo</p><span className="mt-2 max-w-full truncate rounded-full border border-white/10 bg-white/[.03] px-2 py-1 text-[8px] font-bold text-zinc-400 sm:text-[9px]">{platform}</span></div>;
}

function Stats({ title, average, oneEighties, accent }: { title: string; average: string; oneEighties: string; accent: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3"><p className="truncate text-[9px] font-black uppercase tracking-wider text-zinc-500">{title}</p><div className="mt-2 flex items-end justify-between gap-2"><div><p className={`text-lg font-black sm:text-xl ${accent}`}>{average}</p><p className="text-[9px] text-zinc-600">Average</p></div><div className="text-right"><p className="text-lg font-black text-zinc-200 sm:text-xl">{oneEighties}</p><p className="text-[9px] text-zinc-600">180er</p></div></div></div>;
}

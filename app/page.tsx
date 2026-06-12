import { createServerSupabaseClient } from '@/lib/supabase-server';
import { 
  Users, Activity, Globe, Trophy, Target, ShieldCheck, 
  Play, ChevronRight, Swords, Star, Shield, Crown
} from 'lucide-react';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RankedDarts – Competitive Darts Matchmaking',
  description: 'Vergiss Gelegenheitsspiele. Tritt der weltweit ersten professionellen Wettbewerbs-Plattform für Darts bei.',
};

export const revalidate = 60;

const RankIcon = ({ type, size = "w-12 h-12" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-xl border shadow-sm transition-transform duration-500`;
  const configs: Record<string, string> = {
    'Eisen': 'bg-zinc-800 border-zinc-700 text-zinc-400',
    'Bronze': 'bg-orange-900/50 border-orange-800 text-orange-300',
    'Silber': 'bg-slate-700 border-slate-600 text-slate-200',
    'Gold': 'bg-yellow-700/50 border-yellow-600 text-yellow-300',
    'Platin': 'bg-cyan-800/50 border-cyan-700 text-cyan-200',
    'Diamant': 'bg-blue-800/50 border-blue-700 text-blue-200',
    'Legende': 'bg-emerald-800/50 border-emerald-700 text-emerald-300',
  };
  const config = configs[type] || configs['Eisen'];
  return (
    <div className={`${baseClass} ${config}`}>
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2" /> : <Shield className="w-1/2 h-1/2" />}
    </div>
  );
};

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  
  const [
    { count: playerCount },
    { count: matchCount },
    { data: sessionData }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('Match').select('*', { count: 'exact', head: true }),
    supabase.auth.getSession()
  ]);

  const isLoggedIn = !!sessionData.session;
  const dbStats = {
    playerCount: playerCount || 0,
    matchCount: matchCount || 0,
    activeQueues: Math.max(1, Math.floor((matchCount || 0) / 10))
  };

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Background (Static & Lightweight) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-emerald-500/5 to-transparent" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#020304]/80 backdrop-blur-md border-b border-white/5 py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-2xl">R</div>
            <div className="flex flex-col leading-none">
              <span className="text-xl font-black tracking-tighter uppercase">RankedDarts</span>
              <span className="text-[8px] font-bold text-emerald-500 tracking-widest uppercase mt-1">Pro Standard</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-10 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
            <Link href="/matchmaking" className="hover:text-white transition-colors">Matchmaking</Link>
            <Link href="/premium" className="text-emerald-500 flex items-center gap-2"><Star className="w-3 h-3 fill-current" /> Premium</Link>
          </div>
          <Link href={isLoggedIn ? '/profile' : '/auth/register'} className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${isLoggedIn ? 'bg-white/5 hover:bg-white/10 border border-white/10' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'}`}>
            {isLoggedIn ? 'Dashboard' : 'Join Elite'}
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-48 pb-32 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-20 items-center">
          <div className="text-center lg:text-left space-y-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Season 1 Active
            </div>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] uppercase italic">
              Play Like <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">A Legend.</span>
            </h1>
            <p className="text-zinc-400 text-lg md:text-xl max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Vergiss Gelegenheitsspiele. Tritt der weltweit ersten <br className="hidden md:block" /> 
              professionellen <span className="text-white font-bold">Wettbewerbs-Plattform</span> für Darts bei.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6">
              <Link href={isLoggedIn ? '/matchmaking' : '/auth/register'} className="group w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-10 py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-transform hover:scale-105">
                <Play className="w-5 h-5 fill-current" /> Play Now
              </Link>
              <Link href="/leaderboard" className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 px-10 py-5 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center">
                Leaderboard
              </Link>
            </div>
          </div>

          {/* Live Preview (Simplified for performance) */}
          <div className="hidden lg:block bg-zinc-900/50 border border-white/10 rounded-[2.5rem] p-10 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-12 pb-6 border-b border-white/5">
              <div className="flex items-center gap-4">
                <Swords className="w-6 h-6 text-emerald-500" />
                <span className="font-black uppercase tracking-widest text-sm">Live Match</span>
              </div>
              <div className="px-3 py-1 bg-red-500/10 text-red-500 text-[8px] font-black uppercase rounded-full animate-pulse">Live</div>
            </div>
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <span className="text-3xl font-black tracking-tighter">CheckoutKing</span>
                <span className="text-5xl font-black text-emerald-500 italic">5</span>
              </div>
              <div className="text-center text-[10px] font-black text-zinc-700 tracking-[0.5em]">VS</div>
              <div className="flex justify-between items-center">
                <span className="text-3xl font-black tracking-tighter text-zinc-400">Darts_Legend</span>
                <span className="text-5xl font-black text-zinc-700 italic">3</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 py-20 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-10 grid grid-cols-2 md:grid-cols-4 gap-12">
          {[
            { label: 'Players', val: dbStats.playerCount, icon: Users, color: 'text-emerald-500' },
            { label: 'Matches', val: dbStats.matchCount, icon: Activity, color: 'text-cyan-500' },
            { label: 'Queues', val: dbStats.activeQueues, icon: Globe, color: 'text-purple-500' },
            { label: 'Prize Pool', val: '€500+', icon: Trophy, color: 'text-amber-500' },
          ].map((s, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-2 text-zinc-500">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{s.label}</span>
              </div>
              <div className="text-4xl font-black tracking-tighter">{typeof s.val === 'number' ? s.val.toLocaleString() : s.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features (Lightweight Cards) */}
      <section className="relative z-10 py-40 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <h2 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter">Built for Pros.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { icon: Target, title: 'Matchmaking', desc: 'Elo-basiertes System für faire Duelle auf Augenhöhe.' },
            { icon: Trophy, title: 'Tournaments', desc: 'Wöchentliche Events mit exklusiven Preisen.' },
            { icon: ShieldCheck, title: 'Anti-Cheat', desc: 'Verifizierte Ergebnisse und aktive Moderation.' }
          ].map((f, i) => (
            <div key={i} className="p-10 rounded-[2rem] bg-zinc-900/30 border border-white/5 hover:border-emerald-500/20 transition-colors">
              <f.icon className="w-10 h-10 text-emerald-500 mb-6" />
              <h4 className="text-xl font-black uppercase italic mb-4">{f.title}</h4>
              <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ranks (Optimized) */}
      <section className="relative z-10 py-40 px-6 max-w-7xl mx-auto">
        <h3 className="text-4xl md:text-6xl font-black uppercase italic mb-20 text-center lg:text-left">Ascend the Ranks.</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Eisen', range: '0 - 999', color: 'from-zinc-500/10' },
            { name: 'Bronze', range: '1000 - 1249', color: 'from-orange-500/10' },
            { name: 'Silber', range: '1250 - 1499', color: 'from-slate-300/10' },
            { name: 'Gold', range: '1500 - 1749', color: 'from-yellow-400/10' },
            { name: 'Platin', range: '1750 - 1999', color: 'from-cyan-400/10' },
            { name: 'Diamant', range: '2000 - 2499', color: 'from-blue-500/10' },
            { name: 'Legende', range: '2500+', color: 'from-emerald-400/10' },
          ].map((rank, i) => (
            <div key={i} className={`p-6 rounded-2xl bg-gradient-to-br ${rank.color} to-transparent border border-white/5 flex items-center justify-between`}>
              <RankIcon type={rank.name} size="w-12 h-12" />
              <div className="text-right">
                <div className="font-black uppercase italic text-sm">{rank.name}</div>
                <div className="text-[9px] text-zinc-500 font-bold uppercase">{rank.range} ELO</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-20 border-t border-white/5 text-center">
        <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-[0.5em]">© 2026 RankedDarts. Built for the elite.</div>
      </footer>
    </main>
  );
}
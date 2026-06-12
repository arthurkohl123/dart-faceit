import { createServerSupabaseClient } from '@/lib/supabase-server';
import { 
  Menu, Swords, Trophy, Users, Target, 
  ShieldCheck, Zap, ChevronRight, Star, 
  Activity, Play, Globe, Shield, Crown
} from 'lucide-react';
import Link from 'next/link';
import { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'RankedDarts – Competitive Darts Matchmaking',
  description: 'Vergiss Gelegenheitsspiele. Tritt der weltweit ersten professionellen Wettbewerbs-Plattform für Darts bei.',
};

export const revalidate = 60;

const RankIcon = ({ type, size = "w-10 h-10 md:w-12 md:h-12" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-xl md:rounded-2xl border shadow-lg transition-transform group-hover:scale-110 duration-500`;
  switch (type) {
    case 'Eisen': return <div className={`${baseClass} bg-zinc-800 border-zinc-700`}><Shield className="w-1/2 h-1/2 text-zinc-400" /></div>;
    case 'Bronze': return <div className={`${baseClass} bg-orange-900/50 border-orange-800`}><Shield className="w-1/2 h-1/2 text-orange-200" /></div>;
    case 'Silber': return <div className={`${baseClass} bg-slate-700 border-slate-600`}><Shield className="w-1/2 h-1/2 text-slate-100" /></div>;
    case 'Gold': return <div className={`${baseClass} bg-yellow-700/50 border-yellow-600`}><Shield className="w-1/2 h-1/2 text-yellow-100" /></div>;
    case 'Platin': return <div className={`${baseClass} bg-cyan-800/50 border-cyan-700`}><Shield className="w-1/2 h-1/2 text-cyan-100" /></div>;
    case 'Diamant': return <div className={`${baseClass} bg-blue-800/50 border-blue-700`}><Shield className="w-1/2 h-1/2 text-blue-100" /></div>;
    case 'Legende': return <div className={`${baseClass} bg-emerald-700/50 border-emerald-600 relative overflow-hidden`}><Crown className="w-1/2 h-1/2 text-white relative z-10" /></div>;
    default: return null;
  }
};

async function StatsTicker() {
  const supabase = await createServerSupabaseClient();
  const [{ count: pCount }, { count: mCount }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('Match').select('*', { count: 'exact', head: true })
  ]);
  const stats = [
    { label: 'Players', val: pCount || 0, color: 'text-emerald-500', icon: Users },
    { label: 'Matches', val: mCount || 0, color: 'text-cyan-500', icon: Activity },
    { label: 'Queues', val: Math.max(1, Math.floor((mCount || 0) / 10)), color: 'text-purple-500', icon: Globe },
    { label: 'Prize Pool', val: '€500+', color: 'text-amber-500', icon: Trophy },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-16">
      {stats.map((s, i) => (
        <div key={i} className="space-y-1 md:space-y-3 group">
          <div className="flex items-center gap-2 md:gap-3">
            <s.icon className={`w-3.5 h-3.5 md:w-5 md:h-5 ${s.color}`} />
            <span className="text-[9px] md:text-[11px] font-black uppercase tracking-widest text-zinc-500">{s.label}</span>
          </div>
          <div className="text-3xl md:text-5xl font-black tracking-tighter">{typeof s.val === 'number' ? s.val.toLocaleString() : s.val}</div>
        </div>
      ))}
    </div>
  );
}

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session;

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-emerald-500/5 blur-[100px] rounded-full" />
      </div>

      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5 py-4 md:py-8">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 md:gap-4 group">
            <div className="w-9 h-9 md:w-12 md:h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl md:text-2xl">R</div>
            <div className="flex flex-col">
              <span className="text-lg md:text-2xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[8px] md:text-[10px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Pro Standard</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-14 text-[12px] font-black uppercase tracking-[0.3em] text-zinc-400">
            <Link href="/leaderboard" className="hover:text-white">Leaderboard</Link>
            <Link href="/matchmaking" className="hover:text-white">Matchmaking</Link>
            <Link href="/premium" className="text-emerald-500 flex items-center gap-2"><Star className="w-4 h-4 fill-current" /> Premium</Link>
          </div>
          <Link href={isLoggedIn ? '/profile' : '/auth/register'} className={`px-5 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${isLoggedIn ? 'bg-white/5 border border-white/10' : 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'}`}>
            {isLoggedIn ? 'Dashboard' : 'Join'}
          </Link>
        </div>
      </nav>

      <section className="relative z-10 pt-40 md:pt-56 pb-24 md:pb-32 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-12 md:gap-20 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/5 border border-white/10 text-[9px] md:text-[11px] font-black uppercase tracking-[0.4em] text-emerald-400 mb-8 md:mb-12">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Season 1 Active
            </div>
            <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] font-black tracking-tighter leading-[0.9] mb-8 md:mb-12 italic uppercase">Play Like <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">A Legend.</span></h1>
            <p className="max-w-2xl mx-auto lg:mx-0 text-zinc-400 text-lg md:text-2xl leading-relaxed mb-10 md:mb-16 font-medium px-4 md:px-0">Vergiss Gelegenheitsspiele. Tritt der weltweit ersten professionellen <span className="text-white font-bold">Wettbewerbs-Plattform</span> für Darts bei.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 md:gap-8 px-4 md:px-0">
              <Link href={isLoggedIn ? '/matchmaking' : '/auth/register'} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-10 md:px-14 py-5 md:py-7 rounded-2xl md:rounded-[2rem] font-black uppercase tracking-widest flex items-center justify-center gap-4 transition-all shadow-xl shadow-emerald-500/20"><Play className="w-5 h-5 fill-current" /> Play Now</Link>
              <Link href="/leaderboard" className="w-full sm:w-auto bg-white/5 border border-white/10 px-10 md:px-14 py-5 md:py-7 rounded-2xl md:rounded-[2rem] font-black uppercase tracking-widest flex items-center justify-center">Leaderboard</Link>
            </div>
          </div>
          <div className="relative hidden lg:block bg-zinc-900/30 border border-white/5 rounded-[3rem] p-10 backdrop-blur-md">
             <div className="flex items-center justify-between border-b border-white/5 pb-6 mb-10">
                <div className="flex items-center gap-4"><Swords className="w-6 h-6 text-emerald-500" /><span className="text-sm font-black uppercase tracking-widest">Live Match</span></div>
                <div className="px-4 py-1.5 bg-red-500/10 text-red-500 text-[10px] font-black uppercase rounded-full animate-pulse">Live</div>
             </div>
             <div className="space-y-12">
                <div className="flex justify-between items-center"><div><div className="text-4xl font-black tracking-tighter">CheckoutKing</div><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">1.450 Elo</div></div><div className="text-6xl font-black text-emerald-500 italic">5</div></div>
                <div className="text-center text-[11px] font-black uppercase tracking-[0.4em] text-zinc-700 italic">VS</div>
                <div className="flex justify-between items-center"><div><div className="text-4xl font-black tracking-tighter text-zinc-500">Darts_Legend</div><div className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">1.432 Elo</div></div><div className="text-6xl font-black text-zinc-800 italic">3</div></div>
             </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-12 md:py-20 border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <Suspense fallback={<div className="h-24 animate-pulse bg-white/5 rounded-2xl" />}><StatsTicker /></Suspense>
        </div>
      </section>

      <section className="relative z-10 py-24 md:py-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 md:mb-24"><h3 className="text-4xl md:text-7xl font-black tracking-tight uppercase italic">Built for Pros.</h3></div>
          <div className="grid md:grid-cols-3 gap-6 md:gap-10">
            {[
              { icon: Target, title: 'Matchmaking', desc: 'Elo-basiertes System für Duelle auf Augenhöhe.' },
              { icon: Trophy, title: 'Tournaments', desc: 'Wöchentliche Turniere mit exklusiven Preisen.' },
              { icon: ShieldCheck, title: 'Anti-Cheat', desc: 'Verifizierte Ergebnisse und aktive Moderation.' }
            ].map((f, i) => (
              <div key={i} className="p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] bg-zinc-900/20 border border-white/5">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-500/10 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-500 mb-6 md:mb-8"><f.icon className="w-6 h-6 md:w-8 md:h-8" /></div>
                <h4 className="text-xl md:text-2xl font-black uppercase tracking-tight mb-4 md:mb-6 italic">{f.title}</h4>
                <p className="text-zinc-500 text-sm md:text-base leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-24 md:py-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center md:items-end justify-between mb-16 md:mb-24 gap-6 text-center md:text-left">
            <div className="space-y-4 md:space-y-6"><h2 className="text-cyan-400 text-[10px] md:text-xs font-black uppercase tracking-[0.6em]">The Progression</h2><h3 className="text-4xl md:text-7xl font-black tracking-tight uppercase italic">Ascend.</h3></div>
            <Link href="/faq" className="px-8 py-4 rounded-xl bg-white/5 border border-white/10 text-[9px] md:text-[10px] font-black uppercase tracking-widest">Rank FAQ</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[
              { name: 'Eisen', range: '0 - 999', color: 'from-zinc-500/10' },
              { name: 'Bronze', range: '1000 - 1249', color: 'from-orange-500/10' },
              { name: 'Silber', range: '1250 - 1499', color: 'from-slate-300/10' },
              { name: 'Gold', range: '1500 - 1749', color: 'from-yellow-400/10' },
              { name: 'Platin', range: '1750 - 1999', color: 'from-cyan-400/10' },
              { name: 'Diamant', range: '2000 - 2499', color: 'from-blue-500/10' },
              { name: 'Legende', range: '2500+', color: 'from-emerald-400/10' },
            ].map((rank, i) => (
              <div key={i} className={`p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] bg-gradient-to-br ${rank.color} to-transparent border border-white/5 flex items-center justify-between`}>
                <RankIcon type={rank.name} />
                <div className="text-right"><h4 className="text-lg md:text-xl font-black uppercase tracking-tighter italic">{rank.name}</h4><div className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-widest">{rank.range} Elo</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-40 md:py-60 px-6 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.02]"><h2 className="text-[40vw] md:text-[30vw] font-black italic uppercase tracking-tighter select-none">Next?</h2></div>
        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-12 md:space-y-16">
          <h3 className="text-5xl md:text-[8rem] font-black tracking-tighter leading-none uppercase italic">Are You<br /><span className="text-emerald-500">Next?</span></h3>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 md:gap-8 px-6">
            <Link href="/auth/register" className="w-full sm:w-auto px-12 md:px-16 py-6 md:py-8 rounded-2xl md:rounded-[2rem] bg-emerald-500 text-black font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20">Create Account</Link>
            <Link href="/matchmaking" className="w-full sm:w-auto px-12 md:px-16 py-6 md:py-8 rounded-2xl md:rounded-[2rem] bg-white/5 border border-white/10 font-black uppercase tracking-widest">Quick Play</Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 pt-16 pb-10 border-t border-white/5 text-center">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12 mb-16">
          <Link href="/" className="flex items-center gap-3"><div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-white font-black text-lg">R</div><div className="flex flex-col text-left leading-none"><span className="text-base font-black tracking-tighter uppercase">RankedDarts</span><span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Pro Standard</span></div></Link>
          <div className="flex items-center gap-8 md:gap-12 text-[9px] md:text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></div>
        </div>
        <div className="text-[9px] md:text-[10px] font-bold text-zinc-700 uppercase tracking-[0.4em]">© 2026 RankedDarts. Built for the elite.</div>
      </footer>
    </main>
  );
}
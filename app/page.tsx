import { createServerSupabaseClient } from '@/lib/supabase-server';
import { 
  Menu, X, Swords, Trophy, Users, Target, 
  ShieldCheck, Zap, ChevronRight, Star, 
  ArrowRight, Activity, Play, Globe, Shield, Crown
} from 'lucide-react';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RankedDarts – Competitive Darts Matchmaking',
  description: 'Vergiss Gelegenheitsspiele. Tritt der weltweit ersten professionellen Wettbewerbs-Plattform für Darts bei.',
};

export const revalidate = 60; // ISR: Cache für 60 Sekunden

const RankIcon = ({ type, size = "w-12 h-12" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-2xl border shadow-lg transition-transform duration-500`;
  
  switch (type) {
    case 'Eisen':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-zinc-600 to-zinc-800 border-zinc-500/30 shadow-zinc-900/40`}>
          <Shield className="w-1/2 h-1/2 text-zinc-400" />
        </div>
      );
    case 'Bronze':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-orange-700 to-orange-900 border-orange-500/30 shadow-orange-900/40`}>
          <Shield className="w-1/2 h-1/2 text-orange-200" />
        </div>
      );
    case 'Silber':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-slate-400 to-slate-600 border-slate-300/30 shadow-slate-500/40`}>
          <Shield className="w-1/2 h-1/2 text-slate-100" />
        </div>
      );
    case 'Gold':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-yellow-500 to-yellow-700 border-yellow-400/30 shadow-yellow-600/40`}>
          <Shield className="w-1/2 h-1/2 text-yellow-100" />
        </div>
      );
    case 'Platin':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-cyan-400 to-cyan-700 border-cyan-300/30 shadow-cyan-500/40`}>
          <Shield className="w-1/2 h-1/2 text-cyan-100" />
        </div>
      );
    case 'Diamant':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-blue-500 to-blue-800 border-blue-400/30 shadow-blue-600/40`}>
          <Shield className="w-1/2 h-1/2 text-blue-100" />
        </div>
      );
    case 'Legende':
      return (
        <div className={`${baseClass} bg-gradient-to-br from-emerald-400 to-emerald-700 border-emerald-300/30 shadow-emerald-500/40 relative overflow-hidden`}>
          <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(255,255,255,0.2),transparent)] animate-[spin_4s_linear_infinite]" />
          <Crown className="w-1/2 h-1/2 text-white relative z-10" />
        </div>
      );
    default:
      return null;
  }
};

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  
  // Daten parallel auf dem Server abrufen
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
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      {/* --- BACKGROUND LAYER --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-emerald-500/10 blur-[150px] rounded-full opacity-50" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[50%] h-[50%] bg-cyan-500/10 blur-[150px] rounded-full opacity-50" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02]" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:100px_100px]" />
      </div>

      {/* --- NAVIGATION --- */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent py-8">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="relative">
              <div className="absolute -inset-2 bg-emerald-500/30 blur-xl rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-700 rounded-2xl flex items-center justify-center text-black font-black text-2xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[10px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">The Pro Standard</span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-14 text-[12px] font-black uppercase tracking-[0.3em] text-zinc-400">
            <Link href="/leaderboard" className="hover:text-white transition-all">Leaderboard</Link>
            <Link href="/matchmaking" className="hover:text-white transition-all">Matchmaking</Link>
            <Link href="/premium" className="text-emerald-500 hover:text-emerald-400 transition-all flex items-center gap-2">
              <Star className="w-4 h-4 fill-current" /> Premium
            </Link>
          </div>

          <div className="flex items-center gap-6">
            <Link href={isLoggedIn ? '/profile' : '/auth/register'} className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${isLoggedIn ? 'bg-white/5 hover:bg-white/10 border border-white/10' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_40px_rgba(16,185,129,0.3)]'}`}>
              {isLoggedIn ? 'Dashboard' : 'Join Elite'}
            </Link>
          </div>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="relative z-10 pt-56 pb-32 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-[1.1fr_0.9fr] gap-20 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-black uppercase tracking-[0.5em] text-emerald-400 mb-12 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Season 1: The Awakening
            </div>
            
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[9rem] font-black tracking-tighter leading-[0.8] mb-12 italic uppercase">
              Play Like   
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-500 drop-shadow-[0_0_50px_rgba(16,185,129,0.2)]">A Legend.</span>
            </h1>
            
            <p className="max-w-2xl mx-auto lg:mx-0 text-zinc-400 text-xl md:text-2xl leading-relaxed mb-16 font-medium">
              Vergiss Gelegenheitsspiele. Tritt der weltweit ersten <br className="hidden md:block" /> 
              professionellen <span className="text-white font-bold">Wettbewerbs-Plattform</span> für Darts bei.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-8">
              <Link 
                href={isLoggedIn ? '/matchmaking' : '/auth/register'}
                className="group w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-14 py-7 rounded-[2rem] font-black uppercase tracking-widest flex items-center justify-center gap-4 transition-all hover:scale-105 shadow-[0_30px_60px_rgba(16,185,129,0.25)]"
              >
                <Play className="w-6 h-6 fill-current" />
                Play Now
                <ChevronRight className="w-7 h-7 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link 
                href="/leaderboard"
                className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 px-14 py-7 rounded-[2rem] font-black uppercase tracking-widest transition-all backdrop-blur-xl flex items-center justify-center"
              >
                Leaderboard
              </Link>
            </div>
          </div>

          {/* --- LIVE MATCH PREVIEW --- */}
          <div className="relative hidden lg:block group">
            <div className="absolute -inset-10 bg-emerald-500/10 blur-[100px] opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />
            <div className="relative bg-zinc-900/40 border border-white/10 rounded-[3rem] p-2 backdrop-blur-2xl">
              <div className="bg-[#050607] rounded-[2.5rem] p-10 space-y-10">
                <div className="flex items-center justify-between border-b border-white/5 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                      <Swords className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Live Match</div>
                      <div className="text-lg font-black tracking-tight">Best of 11 Legs</div>
                    </div>
                  </div>
                  <div className="px-4 py-1.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full animate-pulse">In Progress</div>
                </div>

                <div className="space-y-12">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="text-4xl font-black tracking-tighter">CheckoutKing</div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">1.450 Elo</span>
                      </div>
                    </div>
                    <div className="text-6xl font-black text-emerald-500 italic">5</div>
                  </div>
                  
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-white/5" /></div>
                    <div className="relative bg-[#050607] px-6 text-[11px] font-black uppercase tracking-[0.4em] text-zinc-600 italic">VS</div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="text-4xl font-black tracking-tighter">Darts_Legend</div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">1.432 Elo</span>
                      </div>
                    </div>
                    <div className="text-6xl font-black text-zinc-700 italic">3</div>
                  </div>
                </div>

                <Link href="/matchmaking" className="w-full py-5 bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center">
                  Match Details ansehen
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- STATS TICKER --- */}
      <section className="relative z-10 py-20 border-y border-white/5 bg-white/[0.01] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
            {[
              { label: 'Players', val: dbStats.playerCount, color: 'text-emerald-500', icon: Users },
              { label: 'Matches', val: dbStats.matchCount, color: 'text-cyan-500', icon: Activity },
              { label: 'Queues', val: dbStats.activeQueues, color: 'text-purple-500', icon: Globe },
              { label: 'Prize Pool', val: '€500+', color: 'text-amber-500', icon: Trophy },
            ].map((s, i) => (
              <div key={i} className="space-y-3 group">
                <div className="flex items-center gap-3">
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-white transition-colors">{s.label}</span>
                </div>
                <div className="text-5xl font-black tracking-tighter">{typeof s.val === 'number' ? s.val.toLocaleString() : s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- FEATURE SHOWCASE --- */}
      <section className="relative z-10 py-40 px-6 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-6 mb-24">
            <h2 className="text-emerald-500 text-xs font-black uppercase tracking-[0.6em]">The Ecosystem</h2>
            <h3 className="text-5xl md:text-7xl font-black tracking-tight uppercase italic">Built for Professionals.</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              { icon: Target, title: 'Smart Matchmaking', desc: 'Keine Lust mehr auf zu starke oder zu schwache Gegner? Unser Elo-System sorgt für Duelle auf Augenhöhe.' },
              { icon: Trophy, title: 'Pro Tournaments', desc: 'Nimm an wöchentlichen Turnieren teil und gewinne exklusive Preise sowie Prestige in der Community.' },
              { icon: ShieldCheck, title: 'Anti-Cheat System', desc: 'Alle Ergebnisse müssen von beiden Spielern bestätigt werden. Unsere Moderatoren prüfen Unstimmigkeiten sofort.' }
            ].map((f, i) => (
              <div key={i} className="group p-12 rounded-[3rem] bg-zinc-900/30 border border-white/5 hover:border-emerald-500/30 transition-all duration-700 hover:-translate-y-2">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-8 group-hover:scale-110 transition-transform duration-500">
                  <f.icon className="w-8 h-8" />
                </div>
                <h4 className="text-2xl font-black uppercase tracking-tight mb-6 italic">{f.title}</h4>
                <p className="text-zinc-500 leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- PROGRESSION / RANKS --- */}
      <section className="relative z-10 py-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-end justify-between mb-24 gap-8">
            <div className="space-y-6">
              <h2 className="text-cyan-400 text-xs font-black uppercase tracking-[0.6em]">The Progression</h2>
              <h3 className="text-5xl md:text-7xl font-black tracking-tight uppercase italic">Ascend the Ranks.</h3>
            </div>
            <Link href="/faq" className="px-10 py-5 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Rank System FAQ</Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Eisen', range: '0 - 999', color: 'from-zinc-500/20', desc: 'Der Anfang deiner Reise.' },
              { name: 'Bronze', range: '1000 - 1249', color: 'from-orange-500/20', desc: 'Du beherrschst die Basics.' },
              { name: 'Silber', range: '1250 - 1499', color: 'from-slate-300/20', desc: 'Ein solider Konkurrent.' },
              { name: 'Gold', range: '1500 - 1749', color: 'from-yellow-400/20', desc: 'Willkommen in der Upper Class.' },
              { name: 'Platin', range: '1750 - 1999', color: 'from-cyan-400/20', desc: 'Ein ernstzunehmender Gegner.' },
              { name: 'Diamant', range: '2000 - 2499', color: 'from-blue-500/20', desc: 'Du gehörst zur Elite.' },
              { name: 'Legende', range: '2500+', color: 'from-emerald-400/20', desc: 'Die absolute Weltspitze.' },
            ].map((rank, i) => (
              <div key={i} className={`group relative p-8 rounded-[2.5rem] bg-gradient-to-br ${rank.color} to-transparent border border-white/5 hover:border-white/10 transition-all duration-500 overflow-hidden`}>
                <div className="relative z-10 flex items-center justify-between mb-8">
                  <RankIcon type={rank.name} size="w-16 h-16" />
                  <div className="text-right">
                    <h4 className="text-xl font-black uppercase tracking-tighter italic">{rank.name}</h4>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{rank.range} Elo</div>
                  </div>
                </div>
                <p className="relative z-10 text-sm text-zinc-400 font-medium leading-relaxed">{rank.desc}</p>
                <div className="absolute -bottom-10 -right-10 text-8xl font-black text-white/[0.02] italic group-hover:scale-110 transition-transform duration-700">{i + 1}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- CTA SECTION --- */}
      <section className="relative z-10 py-60 px-6 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03]">
          <h2 className="text-[30vw] font-black italic uppercase tracking-tighter select-none">Next?</h2>
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-16">
          <h3 className="text-6xl md:text-[8rem] font-black tracking-tighter leading-none uppercase italic">Are You<br /><span className="text-emerald-500">Next?</span></h3>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <Link href="/auth/register" className="w-full sm:w-auto px-16 py-8 rounded-[2rem] bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest transition-all hover:scale-105 shadow-[0_20px_50px_rgba(16,185,129,0.3)]">Create Account</Link>
            <Link href="/matchmaking" className="w-full sm:w-auto px-16 py-8 rounded-[2rem] bg-white/5 hover:bg-white/10 border border-white/10 font-black uppercase tracking-widest transition-all">Quick Play</Link>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="relative z-10 pt-20 pb-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-12 mb-20">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white font-black text-xl">R</div>
              <div className="flex flex-col">
                <span className="text-lg font-black tracking-tighter uppercase leading-none">RankedDarts</span>
                <span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">The Pro Standard</span>
              </div>
            </Link>
            <div className="flex items-center gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
              <Link href="/privacy" className="hover:text-white transition-all">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-all">Terms</Link>
              <Link href="/support" className="hover:text-white transition-all">Support</Link>
            </div>
          </div>
          <div className="text-center text-[10px] font-bold text-zinc-700 uppercase tracking-[0.5em]">© 2026 RankedDarts. Built for the elite.</div>
        </div>
      </footer>
    </main>
  );
}
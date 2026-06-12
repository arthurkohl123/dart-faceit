'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Menu, X, Swords, Trophy, Users, Target, 
  ShieldCheck, Zap, ChevronRight, Star, 
  ArrowRight, Activity, Play, Globe, MousePointer2
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  
  // Real-time Stats from Database
  const [dbStats, setDbStats] = useState({
    playerCount: 0,
    matchCount: 0,
    activeQueues: 0
  });

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    // Check Auth
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsLoggedIn(true);
    });
    
    // Fetch Real Stats from Supabase
    const fetchStats = async () => {
      try {
        const { count: pCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        const { count: mCount } = await supabase.from('Match').select('*', { count: 'exact', head: true });
        
        setDbStats({
          playerCount: pCount || 0,
          matchCount: mCount || 0,
          activeQueues: Math.max(1, Math.floor((mCount || 0) / 12))
        });
      } catch (err) {
        console.error("Fehler beim Laden der Stats:", err);
      }
    };

    fetchStats();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      {/* Advanced Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png' )] opacity-[0.03]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:80px_80px]" />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-xl border-b border-white/5 py-3' : 'bg-transparent py-7'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute -inset-2 bg-emerald-500/20 blur-lg rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative w-11 h-11 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-black font-black text-2xl shadow-lg transition-transform group-hover:scale-110">R</div>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[9px] font-bold text-emerald-500 tracking-[0.3em] uppercase mt-1">Professional</span>
            </div>
          </Link>

          <div className="hidden lg:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400">
            <Link href="/leaderboard" className="hover:text-emerald-400 transition-all hover:tracking-[0.3em]">Leaderboard</Link>
            <Link href="/matchmaking" className="hover:text-emerald-400 transition-all hover:tracking-[0.3em]">Matchmaking</Link>
            <Link href="/premium" className="text-emerald-500 hover:text-emerald-300 transition-all flex items-center gap-2">
              <Star className="w-3.5 h-3.5 fill-current" /> Premium
            </Link>
          </div>

          <div className="flex items-center gap-5">
            {isLoggedIn ? (
              <button 
                onClick={() => router.push('/profile')} 
                className="group relative px-7 py-2.5 rounded-full overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
              >
                <span className="relative z-10 text-xs font-bold uppercase tracking-widest">Dashboard</span>
              </button>
            ) : (
              <button 
                onClick={() => router.push('/auth/register')} 
                className="group relative px-8 py-3 rounded-full overflow-hidden bg-emerald-500 hover:bg-emerald-400 text-black transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)]"
              >
                <span className="relative z-10 text-xs font-black uppercase tracking-widest">Start Playing</span>
              </button>
            )}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="lg:hidden p-2 text-zinc-400 hover:text-white transition-colors"><Menu /></button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl lg:hidden flex flex-col items-center justify-center gap-10 p-10">
          <button onClick={() => setMobileMenuOpen(false)} className="absolute top-8 right-8 text-zinc-400"><X size={32} /></button>
          <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-black uppercase tracking-tighter hover:text-emerald-400">Leaderboard</Link>
          <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-black uppercase tracking-tighter hover:text-emerald-400">Matchmaking</Link>
          <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="text-3xl font-black uppercase tracking-tighter text-emerald-500">Premium</Link>
          <button onClick={() => router.push('/auth/register')} className="w-full bg-emerald-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest mt-10">Join Now</button>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative z-10 pt-48 pb-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-black uppercase tracking-[0.4em] text-emerald-400 mb-10 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              The Next Generation of Darts
            </div>
            
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[9rem] font-black tracking-tighter leading-[0.85] mb-10 italic">
              COMPETE.   

              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]">DOMINATE.</span>
            </h1>
            
            <p className="max-w-3xl mx-auto text-zinc-400 text-lg md:text-2xl leading-relaxed mb-16 font-medium">
              Vergiss Zufallsgegner. Spiele auf der weltweit ersten <br className="hidden md:block" /> 
              professionellen <span className="text-zinc-100">Ranked-Plattform</span> für Dartspieler.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full sm:w-auto">
              <button 
                onClick={() => router.push(isLoggedIn ? '/matchmaking' : '/auth/register')}
                className="group relative w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-12 py-6 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-4 transition-all hover:scale-[1.05] shadow-[0_20px_50px_rgba(16,185,129,0.3)]"
              >
                <Play className="w-5 h-5 fill-current" />
                Play Now
                <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                onClick={() => router.push('/leaderboard')}
                className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 px-12 py-6 rounded-2xl font-black uppercase tracking-widest transition-all backdrop-blur-md"
              >
                Leaderboard
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats Ticker */}
      <section className="relative z-10 py-16 border-y border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="space-y-2 group">
              <div className="flex items-center gap-3 text-emerald-500 mb-2">
                <Users className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-emerald-400 transition-colors">Players</span>
              </div>
              <div className="text-4xl md:text-5xl font-black tracking-tighter">{dbStats.playerCount.toLocaleString()}</div>
              <div className="h-1 w-12 bg-emerald-500 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center gap-3 text-cyan-500 mb-2">
                <Activity className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-cyan-400 transition-colors">Matches</span>
              </div>
              <div className="text-4xl md:text-5xl font-black tracking-tighter">{dbStats.matchCount.toLocaleString()}</div>
              <div className="h-1 w-12 bg-cyan-500 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center gap-3 text-purple-500 mb-2">
                <Globe className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-purple-400 transition-colors">Active Queues</span>
              </div>
              <div className="text-4xl md:text-5xl font-black tracking-tighter">{dbStats.activeQueues}</div>
              <div className="h-1 w-12 bg-purple-500 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center gap-3 text-amber-500 mb-2">
                <Trophy className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-amber-400 transition-colors">Prize Pool</span>
              </div>
              <div className="text-4xl md:text-5xl font-black tracking-tighter">€500+</div>
              <div className="h-1 w-12 bg-amber-500 rounded-full scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <section className="relative z-10 py-40 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-24 items-center">
            <div className="space-y-12">
              <div className="space-y-6">
                <h2 className="text-emerald-500 text-xs font-black uppercase tracking-[0.5em]">The Ecosystem</h2>
                <h3 className="text-5xl md:text-6xl font-black tracking-tight leading-tight">Warum RankedDarts?</h3>
                <p className="text-zinc-400 text-xl leading-relaxed">Wir haben die Tools von professionellen E-Sport-Plattformen genommen und sie für die Darts-Welt optimiert.</p>
              </div>
              
              <div className="grid gap-8">
                {[
                  { icon: Target, title: 'Smart Matchmaking', desc: 'Spiele nie wieder gegen "Sandbagger" oder viel zu starke Gegner.' },
                  { icon: ShieldCheck, title: 'Verified Results', desc: 'Kein Betrug möglich. Alle Scores werden doppelt bestätigt.' },
                  { icon: Zap, title: 'Real-Time Elo', desc: 'Sieh deinen Aufstieg sofort nach dem letzten Dart im Leaderboard.' }
                ].map((f, i) => (
                  <div key={i} className="flex gap-6 group">
                    <div className="flex-shrink-0 w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                      <f.icon className="w-7 h-7" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xl font-black tracking-tight">{f.title}</h4>
                      <p className="text-zinc-500 text-sm">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative group">
              <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 blur-3xl opacity-50 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-zinc-900/40 border border-white/10 rounded-[3rem] p-2 backdrop-blur-2xl">
                <div className="bg-[#050607] rounded-[2.5rem] p-8 md:p-12 space-y-8">
                  <div className="flex items-center justify-between border-b border-white/5 pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
                        <Swords className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-black uppercase tracking-widest text-zinc-500">Aktuelles Match</div>
                        <div className="text-lg font-black tracking-tight">Best of 11 Legs</div>
                      </div>
                    </div>
                    <div className="px-4 py-1.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full animate-pulse">Live</div>
                  </div>

                  <div className="space-y-10">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="text-3xl font-black tracking-tighter">ProPlayer_99</div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">1.450 Elo</span>
                        </div>
                      </div>
                      <div className="text-5xl font-black text-emerald-500 italic">5</div>
                    </div>
                    
                    <div className="relative flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center"><div className="w-full h-px bg-white/5" /></div>
                      <div className="relative bg-[#050607] px-4 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 italic">VS</div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="text-3xl font-black tracking-tighter">Darts_Legend</div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-cyan-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">1.432 Elo</span>
                        </div>
                      </div>
                      <div className="text-5xl font-black text-zinc-700 italic">3</div>
                    </div>
                  </div>

                  <button className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Match Details ansehen</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ranks & Progression */}
      <section className="relative z-10 py-40 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-6 mb-24">
            <h2 className="text-emerald-500 text-xs font-black uppercase tracking-[0.5em]">Progression</h2>
            <h3 className="text-5xl md:text-7xl font-black tracking-tight">Kämpfe dich an die Spitze.</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Bronze', range: '800 - 999', color: 'from-orange-500/20', icon: '🥉' },
              { name: 'Silver', range: '1000 - 1199', color: 'from-zinc-400/20', icon: '🥈' },
              { name: 'Elite', range: '1200 - 1499', color: 'from-emerald-400/20', icon: '🥇' },
              { name: 'Legend', range: '1500+', color: 'from-cyan-400/20', icon: '💎' },
            ].map((rank, i) => (
              <div key={i} className="group relative p-10 rounded-[2.5rem] border border-white/5 bg-white/[0.02] overflow-hidden transition-all hover:-translate-y-3 hover:border-white/10">
                <div className={`absolute inset-0 bg-gradient-to-br ${rank.color} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative space-y-6">
                  <div className="text-5xl">{rank.icon}</div>
                  <div>
                    <h4 className="text-3xl font-black tracking-tighter mb-1">{rank.name}</h4>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{rank.range} Elo</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-40 px-6">
        <div className="max-w-7xl mx-auto relative overflow-hidden rounded-[4rem] bg-gradient-to-br from-emerald-500 via-emerald-600 to-cyan-600 p-1 md:p-2 shadow-[0_40px_100px_rgba(16,185,129,0.2)]">
          <div className="bg-[#020304] rounded-[3.8rem] px-8 py-24 md:py-32 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/[0.03] animate-pulse" />
            <div className="relative space-y-12">
              <h2 className="text-5xl md:text-8xl font-black tracking-tighter italic leading-none">
                BIST DU   
 <span className="text-emerald-500">BEREIT?</span>
              </h2>
              <p className="max-w-2xl mx-auto text-zinc-400 text-xl md:text-2xl font-medium leading-relaxed">
                Erstelle deinen Account in 30 Sekunden und starte dein erstes Match. <br className="hidden md:block" />
                Der Weg zur Legende beginnt hier.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <button 
                  onClick={() => router.push('/auth/register')}
                  className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-black px-12 py-6 rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.05]"
                >
                  Account Erstellen
                </button>
                <button 
                  onClick={() => router.push('/matchmaking')}
                  className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 px-12 py-6 rounded-2xl font-black uppercase tracking-widest transition-all"
                >
                  Quick Match
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-24 px-6 border-t border-white/5 bg-black/40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-12 mb-16">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-white font-black text-xl">R</div>
              <div className="flex flex-col">
                <span className="font-black uppercase tracking-widest text-lg">RankedDarts</span>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.4em]">The Pro Standard</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-10 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/support" className="hover:text-white transition-colors">Support</Link>
              <Link href="/updates" className="hover:text-white transition-colors">Updates</Link>
            </div>
          </div>
          <div className="text-center text-[10px] font-bold text-zinc-700 uppercase tracking-[0.5em]">
            © 2026 RankedDarts. Built for the community.
          </div>
        </div>
      </footer>
    </main>
  );
}

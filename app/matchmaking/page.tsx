'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Swords, Trophy, Users, Target, ShieldCheck, Zap, 
  Search, Timer, Play, X, CheckCircle2, AlertCircle, 
  Camera, LayoutDashboard, ArrowRight, Shield, Crown,
  Globe, Activity, Loader2, Sparkles, User as UserIcon,
  Settings, Star, LogOut, ChevronRight, Phone, Flame,
  Radar, BarChart3, Clock, ArrowUpRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- CONFIG ---
type AppChoice = 'scolia' | 'dartcounter';
const appConfig = {
  scolia: { label: 'Scolia', icon: Camera, color: 'emerald' },
  dartcounter: { label: 'DartCounter', icon: LayoutDashboard, color: 'cyan' }
};

const RankIcon = ({ type, size = "w-14 h-14" }: { type: string, size?: string }) => {
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-900 border-zinc-700 text-zinc-500',
    'Bronze': 'bg-gradient-to-br from-orange-900/40 to-black border-orange-800/50 text-orange-400',
    'Silber': 'bg-gradient-to-br from-slate-700/40 to-black border-slate-600/50 text-slate-200',
    'Gold': 'bg-gradient-to-br from-yellow-700/40 to-black border-yellow-600/50 text-yellow-300',
    'Platin': 'bg-gradient-to-br from-cyan-800/40 to-black border-cyan-700/50 text-cyan-300',
    'Diamant': 'bg-gradient-to-br from-blue-800/40 to-black border-blue-700/50 text-blue-300',
    'Legende': 'bg-gradient-to-br from-emerald-700/40 to-black border-emerald-600/50 text-white',
  };
  return (
    <div className={`${size} relative flex items-center justify-center rounded-2xl border transition-all ${styles[type] || styles['Eisen']}`}>
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2" /> : <Shield className="w-1/2 h-1/2" />}
    </div>
  );
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400', glow: 'from-zinc-500/10' },
  { name: 'Bronze',  min: 1000, color: 'text-orange-400', glow: 'from-orange-500/10' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300', glow: 'from-slate-300/10' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-400', glow: 'from-yellow-400/10' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-400', glow: 'from-cyan-400/10' },
  { name: 'Diamant', min: 2000, color: 'text-blue-400', glow: 'from-blue-500/10' },
  { name: 'Legende', min: 2500, color: 'text-emerald-400', glow: 'from-emerald-400/10' },
];

function getRank(elo: number) {
  return rankTiers.reduce((cur, r) => (elo >= r.min ? r : cur), rankTiers[0]);
}

export default function MatchmakingPage() {
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'accepting' | 'error'>('idle');
  const [selectedApp, setSelectedApp] = useState<AppChoice | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [queueCounts, setQueueCounts] = useState({ scolia: 0, dartcounter: 0 });
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [currentRange, setCurrentRange] = useState(50);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // --- REALTIME LOGIC ---
  useEffect(() => {
    const fetchInitial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single();
      if (prof) setProfile(prof);
      
      // Initial Live Matches
      const { data: active } = await supabase.from('active_matches').select('*').neq('status', 'completed').order('created_at', { ascending: false }).limit(5);
      if (active) setLiveMatches(active);
    };
    fetchInitial();

    // Realtime Subscription für Live Arena
    const channel = supabase.channel('arena_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_matches' }, (payload) => {
        fetchInitial(); // Einfacher Refresh bei Änderungen
      })
      .subscribe();

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [supabase, router]);

  useEffect(() => {
    let interval: any;
    if (status === 'searching') {
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
        if (elapsedSeconds > 30) setCurrentRange(150);
        if (elapsedSeconds > 60) setCurrentRange(300);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, elapsedSeconds]);

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-32">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[80%] h-[80%] blur-[160px] rounded-full opacity-20 bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      {/* Floating Navigation */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-4xl mx-auto transition-all duration-700 rounded-[2rem] border ${scrolled ? 'bg-black/80 backdrop-blur-2xl py-3 border-white/10 shadow-2xl' : 'bg-white/5 backdrop-blur-md py-5 border-white/5'}`}>
          <div className="px-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-lg shadow-2xl transition-all group-hover:scale-110">R</div>
              <span className="text-lg font-black tracking-tighter uppercase hidden sm:block">RankedDarts</span>
            </Link>
            <div className="flex items-center gap-6">
               <Link href="/leaderboard" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">Ranks</Link>
               <div className="h-6 w-px bg-white/10" />
               <Link href="/profile" className="flex items-center gap-4 group">
                  <div className="flex flex-col items-end hidden sm:flex">
                     <span className="text-[10px] font-black uppercase tracking-widest">{profile?.username || 'Player'}</span>
                     <span className={`text-[8px] font-bold uppercase tracking-widest ${currentRank.color}`}>{elo} Elo</span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-black italic text-xs group-hover:border-emerald-500 transition-all">
                     {(profile?.username || 'S').charAt(0)}
                  </div>
               </Link>
            </div>
          </div>
        </nav>
      </div>

      <section className="relative z-10 pt-40 md:pt-52 px-6">
        <div className="max-w-6xl mx-auto">
          
          <div className="grid lg:grid-cols-12 gap-8">
            
            {/* Sidebar Left: Player Info (3 cols) */}
            <div className="lg:col-span-3 space-y-6">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl text-center space-y-6 relative overflow-hidden group">
                  <div className="relative inline-block">
                    <div className={`absolute -inset-4 blur-2xl opacity-20 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent`} />
                    <RankIcon type={currentRank.name} size="w-20 h-20" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter">{profile?.username}</h2>
                    <p className={`text-[9px] font-black uppercase tracking-[0.4em] ${currentRank.color}`}>{currentRank.name} Tier</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                    <div><div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Elo</div><div className="text-xl font-black italic">{elo}</div></div>
                    <div><div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Winrate</div><div className="text-xl font-black italic text-emerald-500">{profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0}%</div></div>
                  </div>
               </div>

               <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl">
                  <div className="flex items-center gap-4 mb-6"><Globe size={18} className="text-cyan-500" /><h3 className="text-[10px] font-black uppercase tracking-widest italic">Live Queues</h3></div>
                  <div className="space-y-3">
                     {[
                       { label: 'Scolia', count: queueCounts.scolia, icon: Camera, color: 'text-emerald-500' },
                       { label: 'DartCounter', count: queueCounts.dartcounter, icon: LayoutDashboard, color: 'text-cyan-500' }
                     ].map((q, i) => (
                       <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                          <div className="flex items-center gap-3"><q.icon size={16} className={q.color} /><span className="text-[9px] font-black uppercase tracking-widest">{q.label}</span></div>
                          <span className="text-lg font-black italic">{q.count}</span>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* Center: Matchmaking (6 cols) - COMPACTED */}
            <div className="lg:col-span-6">
               <div className="p-8 md:p-12 rounded-[3rem] bg-zinc-900/40 border border-white/10 backdrop-blur-2xl relative overflow-hidden min-h-[480px] flex flex-col items-center justify-center text-center group">
                  
                  {status === 'idle' && (
                     <div className="relative w-full max-w-sm space-y-10 animate-in fade-in zoom-in duration-500">
                        <div className="space-y-4">
                           <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mx-auto shadow-2xl"><Play size={32} fill="currentColor" className="ml-1" /></div>
                           <h2 className="text-4xl font-black italic uppercase tracking-tighter">Enter Arena</h2>
                           <p className="text-zinc-500 text-sm font-medium">Wähle deine Plattform und starte die Suche.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           {(['scolia', 'dartcounter'] as const).map((app) => (
                             <button 
                                key={app}
                                onClick={() => setSelectedApp(app)}
                                className={`p-6 rounded-2xl border-2 transition-all duration-300 ${selectedApp === app ? `bg-${appConfig[app].color}-500 border-${appConfig[app].color}-500 text-black shadow-2xl scale-105` : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10'}`}
                             >
                                {app === 'scolia' ? <Camera size={28} className="mx-auto mb-3" /> : <LayoutDashboard size={28} className="mx-auto mb-3" />}
                                <span className="text-[9px] font-black uppercase tracking-widest">{appConfig[app].label}</span>
                             </button>
                           ))}
                        </div>

                        <button 
                           disabled={!selectedApp}
                           onClick={() => setStatus('searching')}
                           className={`w-full py-6 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 ${selectedApp ? 'bg-white text-black hover:scale-[1.02] shadow-2xl' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                        >
                           Start Search <ArrowRight size={18} />
                        </button>
                     </div>
                  )}

                  {status === 'searching' && (
                     <div className="relative w-full space-y-10 animate-in fade-in zoom-in duration-500">
                        <div className="relative w-40 h-40 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin mx-auto flex items-center justify-center">
                           <div className="text-4xl font-black italic animate-none">{elapsedSeconds}s</div>
                        </div>
                        <div className="space-y-4">
                           <h2 className="text-4xl font-black italic uppercase tracking-tighter animate-pulse">Searching...</h2>
                           <div className="flex flex-col items-center gap-4">
                              <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-full flex items-center gap-3">
                                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                 <span className="text-[9px] font-black uppercase tracking-widest">Radius: ±{currentRange} Elo</span>
                              </div>
                              <div className="flex gap-2 w-full max-w-[200px]">
                                 {[50, 150, 300].map((r, i) => (
                                   <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-1000 ${currentRange >= r ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-white/5'}`} />
                                 ))}
                              </div>
                           </div>
                        </div>
                        <button onClick={() => setStatus('idle')} className="px-8 py-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Cancel</button>
                     </div>
                  )}

                  {status === 'found' && (
                     <div className="relative w-full space-y-10 animate-in fade-in zoom-in duration-500">
                        <div className="flex items-center justify-center gap-8 md:gap-12">
                           <div className="flex flex-col items-center gap-4">
                              <div className="w-24 h-24 rounded-[2rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl relative">
                                 <span className="text-4xl font-black italic">{(profile?.username || 'S').charAt(0)}</span>
                                 {iHaveAccepted && <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-emerald-500" size={32} /></div>}
                              </div>
                              <div className="text-[10px] font-black italic uppercase">{profile?.username}</div>
                           </div>
                           <div className="text-4xl font-black italic text-zinc-800 select-none">VS</div>
                           <div className="flex flex-col items-center gap-4">
                              <div className="w-24 h-24 rounded-[2rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl relative">
                                 <UserIcon size={40} className="text-zinc-700" />
                                 {opponentAccepted && <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-emerald-500" size={32} /></div>}
                              </div>
                              <div className="text-[10px] font-black italic uppercase animate-pulse">Opponent</div>
                           </div>
                        </div>
                        <div className="max-w-xs mx-auto space-y-6">
                           <div className="flex items-center justify-center gap-3 text-emerald-500"><Zap size={20} className="animate-bounce" /><span className="text-xl font-black italic uppercase tracking-widest">Match Found!</span></div>
                           <button 
                              onClick={() => setIHaveAccepted(true)}
                              disabled={iHaveAccepted}
                              className={`w-full py-6 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl transition-all ${iHaveAccepted ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-emerald-500 text-black hover:scale-[1.02]'}`}
                           >
                              {iHaveAccepted ? 'Waiting...' : 'Accept Match'}
                           </button>
                        </div>
                     </div>
                  )}
               </div>
            </div>

            {/* Sidebar Right: Live Arena (3 cols) */}
            <div className="lg:col-span-3 space-y-6">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl group h-full flex flex-col">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-4"><Activity size={18} className="text-purple-500" /><h3 className="text-[10px] font-black uppercase tracking-widest italic text-white">Live Arena</h3></div>
                     <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  </div>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                     {liveMatches.length > 0 ? liveMatches.map((m, i) => (
                       <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between group/match hover:bg-white/[0.05] transition-all">
                          <div className="flex flex-col min-w-0">
                             <span className="text-[9px] font-black italic uppercase truncate">{m.player1_username} vs {m.player2_username}</span>
                             <span className={`text-[7px] font-black uppercase tracking-[0.2em] ${m.app === 'scolia' ? 'text-emerald-500' : 'text-cyan-500'}`}>{m.app}</span>
                          </div>
                          <ArrowUpRight size={14} className="text-zinc-800 group-hover/match:text-white transition-colors flex-shrink-0" />
                       </div>
                     )) : (
                       <div className="text-center py-10 text-[9px] font-black uppercase tracking-widest text-zinc-700 italic">No matches...</div>
                     )}
                  </div>
                  <div className="mt-8 pt-6 border-t border-white/5">
                     <div className="flex items-center gap-3 mb-4"><ShieldCheck size={14} className="text-emerald-500" /><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Arena Rules</span></div>
                     <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest leading-relaxed">Cam mandatory. Fair play enforced. No-shows result in automatic bans.</p>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
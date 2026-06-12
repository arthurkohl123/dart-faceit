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

// --- CONFIG & HELPERS ---
type AppChoice = 'scolia' | 'dartcounter';
const appConfig = {
  scolia: { label: 'Scolia', icon: Camera, color: 'emerald', glow: 'shadow-[0_0_50px_rgba(16,185,129,0.2)]' },
  dartcounter: { label: 'DartCounter', icon: LayoutDashboard, color: 'cyan', glow: 'shadow-[0_0_50px_rgba(6,182,212,0.2)]' }
};

const RankIcon = ({ type, size = "w-16 h-16" }: { type: string, size?: string }) => {
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-900 border-zinc-700 text-zinc-500 shadow-[0_0_20px_rgba(39,39,42,0.3)]',
    'Bronze': 'bg-gradient-to-br from-orange-900/40 to-black border-orange-800/50 text-orange-400 shadow-[0_0_20px_rgba(124,45,18,0.3)]',
    'Silber': 'bg-gradient-to-br from-slate-700/40 to-black border-slate-600/50 text-slate-200 shadow-[0_0_20px_rgba(71,85,105,0.3)]',
    'Gold': 'bg-gradient-to-br from-yellow-700/40 to-black border-yellow-600/50 text-yellow-300 shadow-[0_0_20px_rgba(161,98,7,0.3)]',
    'Platin': 'bg-gradient-to-br from-cyan-800/40 to-black border-cyan-700/50 text-cyan-300 shadow-[0_0_20px_rgba(21,94,117,0.3)]',
    'Diamant': 'bg-gradient-to-br from-blue-800/40 to-black border-blue-700/50 text-blue-300 shadow-[0_0_20px_rgba(30,64,175,0.3)]',
    'Legende': 'bg-gradient-to-br from-emerald-700/40 to-black border-emerald-600/50 text-white shadow-[0_0_20px_rgba(6,95,70,0.3)]',
  };
  return (
    <div className={`${size} relative flex items-center justify-center rounded-2xl border transition-all duration-700 group-hover:scale-110 ${styles[type] || styles['Eisen']}`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-50" />
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2 relative z-10" /> : <Shield className="w-1/2 h-1/2 relative z-10" />}
    </div>
  );
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400', glow: 'from-zinc-500/20' },
  { name: 'Bronze',  min: 1000, color: 'text-orange-400', glow: 'from-orange-500/20' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300', glow: 'from-slate-300/20' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-400', glow: 'from-yellow-400/20' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-400', glow: 'from-cyan-400/20' },
  { name: 'Diamant', min: 2000, color: 'text-blue-400', glow: 'from-blue-500/20' },
  { name: 'Legende', min: 2500, color: 'text-emerald-400', glow: 'from-emerald-400/20' },
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
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [currentRange, setCurrentRange] = useState(50);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponent, setOpponent] = useState<any>(null);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    const fetchInitial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single();
      if (prof) setProfile(prof);
      const { data: active } = await supabase.from('active_matches').select('*').neq('status', 'completed').limit(3);
      if (active) setLiveMatches(active);
    };
    fetchInitial();
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [supabase, router]);

  useEffect(() => {
    let interval: any;
    if (status === 'searching') {
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
        if (elapsedSeconds > 30) setCurrentRange(150);
        if (elapsedSeconds > 60) setCurrentRange(300);
        if (elapsedSeconds > 90) setCurrentRange(500);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, elapsedSeconds]);

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-32">
      {/* Cinematic Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[100%] h-[100%] blur-[160px] rounded-full opacity-30 bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.04]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020304]/50 to-[#020304]" />
      </div>

      {/* Floating Elite Navigation */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-5xl mx-auto transition-all duration-700 rounded-[2.5rem] border ${scrolled ? 'bg-black/80 backdrop-blur-2xl py-3 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-white/5 backdrop-blur-md py-6 border-white/5'}`}>
          <div className="px-10 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all group-hover:scale-110">R</div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-xl font-black tracking-tighter uppercase">RankedDarts</span>
                <span className="text-[9px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Arena Interface</span>
              </div>
            </Link>
            <div className="flex items-center gap-10">
               <div className="hidden md:flex items-center gap-10 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
                  <Link href="/profile" className="hover:text-white transition-colors">Profile</Link>
                  <Link href="/premium" className="text-emerald-500 flex items-center gap-2"><Star size={12} fill="currentColor" /> Elite</Link>
               </div>
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all">
                    <Settings className="w-5 h-5 text-zinc-500" />
                  </div>
               </div>
            </div>
          </div>
        </nav>
      </div>

      <section className="relative z-10 pt-48 md:pt-64 px-6">
        <div className="max-w-7xl mx-auto">
          
          <div className="grid lg:grid-cols-4 gap-10">
            
            {/* Sidebar Dashboard */}
            <div className="lg:col-span-1 space-y-10">
               {/* Profile Card Bento */}
               <div className="p-10 rounded-[3.5rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-110 transition-transform"><UserIcon size={180} /></div>
                  <div className="relative flex flex-col items-center text-center gap-8">
                     <div className="relative">
                        <div className={`absolute -inset-6 blur-[40px] opacity-40 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
                        <div className="relative w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-zinc-800 to-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                          <span className="text-6xl font-black text-white/10 italic">{(profile?.username || 'S').charAt(0)}</span>
                        </div>
                        <div className="absolute -bottom-6 -right-6"><RankIcon type={currentRank.name} /></div>
                     </div>
                     <div className="space-y-2">
                        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">{profile?.username}</h2>
                        <p className={`text-[11px] font-black uppercase tracking-[0.5em] ${currentRank.color}`}>{currentRank.name} Tier</p>
                     </div>
                     <div className="grid grid-cols-2 w-full gap-6 pt-8 border-t border-white/5">
                        <div className="text-center space-y-1">
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Elo Rating</div>
                           <div className="text-3xl font-black italic text-white">{elo}</div>
                        </div>
                        <div className="text-center space-y-1">
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Winrate</div>
                           <div className="text-3xl font-black italic text-emerald-500">{profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0}%</div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Queue Status Bento */}
               <div className="p-10 rounded-[3.5rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl">
                  <div className="flex items-center gap-5 mb-10">
                     <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)]"><Globe size={24} /></div>
                     <h3 className="text-lg font-black uppercase tracking-tighter italic">Live Arena</h3>
                  </div>
                  <div className="space-y-6">
                     {[
                       { label: 'Scolia', count: queueCounts.scolia, icon: Camera, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
                       { label: 'DartCounter', count: queueCounts.dartcounter, icon: LayoutDashboard, color: 'text-cyan-500', bg: 'bg-cyan-500/5' }
                     ].map((q, i) => (
                       <div key={i} className={`p-6 rounded-[2rem] ${q.bg} border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all`}>
                          <div className="flex items-center gap-5"><q.icon size={24} className={q.color} /><span className="text-[11px] font-black uppercase tracking-widest text-zinc-300">{q.label}</span></div>
                          <span className="text-2xl font-black italic text-white">{q.count}</span>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* Centerpiece: The Arena */}
            <div className="lg:col-span-3 space-y-10">
               
               <div className="relative p-1 md:p-1.5 rounded-[4.5rem] bg-gradient-to-br from-white/10 via-transparent to-white/5 overflow-hidden">
                  <div className="relative p-12 md:p-24 rounded-[4.4rem] bg-[#050607] min-h-[650px] flex flex-col items-center justify-center text-center overflow-hidden group">
                     
                     {/* Background Visuals */}
                     <div className="absolute inset-0 opacity-[0.03] pointer-events-none flex items-center justify-center scale-150 rotate-12 transition-transform duration-[3s] group-hover:rotate-0">
                        <Swords size={600} />
                     </div>
                     <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />

                     {status === 'idle' && (
                        <div className="relative w-full max-w-2xl space-y-16 animate-in fade-in zoom-in duration-1000">
                           <div className="space-y-8">
                              <div className="relative inline-block">
                                 <div className="absolute -inset-8 blur-[40px] opacity-20 rounded-full bg-emerald-500 animate-pulse" />
                                 <div className="relative w-28 h-28 bg-emerald-500/10 rounded-[2.5rem] flex items-center justify-center text-emerald-500 shadow-inner border border-emerald-500/20">
                                    <Play size={48} fill="currentColor" className="ml-2" />
                                 </div>
                              </div>
                              <div className="space-y-4">
                                 <h2 className="text-6xl md:text-8xl font-black italic uppercase tracking-tighter text-white">The Arena Awaits</h2>
                                 <p className="text-zinc-500 text-xl md:text-2xl font-medium max-w-lg mx-auto leading-relaxed">Wähle deine Waffe und tritt dem globalen Ranking bei.</p>
                              </div>
                           </div>

                           <div className="grid md:grid-cols-2 gap-8 max-w-xl mx-auto">
                              {(['scolia', 'dartcounter'] as const).map((app) => (
                                <button 
                                   key={app}
                                   onClick={() => setSelectedApp(app)}
                                   className={`relative p-10 rounded-[3rem] border-2 transition-all duration-500 group/btn overflow-hidden ${selectedApp === app ? `bg-${appConfig[app].color}-500 border-${appConfig[app].color}-500 text-black shadow-[0_0_60px_rgba(16,185,129,0.3)] scale-105` : 'bg-white/[0.03] border-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/5'}`}
                                >
                                   <div className="relative z-10">
                                      {app === 'scolia' ? <Camera size={48} className="mx-auto mb-6" /> : <LayoutDashboard size={48} className="mx-auto mb-6" />}
                                      <span className="text-sm font-black uppercase tracking-[0.3em]">{appConfig[app].label}</span>
                                   </div>
                                   {selectedApp === app && <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-50" />}
                                </button>
                              ))}
                           </div>

                           <button 
                              disabled={!selectedApp || !profile?.phone_verified || cooldownSeconds > 0}
                              onClick={() => setStatus('searching')}
                              className={`group relative w-full max-w-md py-8 rounded-[2.5rem] font-black uppercase tracking-[0.3em] text-xl transition-all duration-500 flex items-center justify-center gap-6 ${selectedApp && profile?.phone_verified ? 'bg-white text-black hover:scale-[1.02] shadow-[0_20px_50px_rgba(255,255,255,0.1)]' : 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-white/5'}`}
                           >
                              {cooldownSeconds > 0 ? `Cooldown Active (${cooldownSeconds}s)` : 'Enter Queue'}
                              <ArrowRight size={24} className="group-hover:translate-x-2 transition-transform" />
                           </button>
                        </div>
                     )}

                     {status === 'searching' && (
                        <div className="relative w-full space-y-16 animate-in fade-in zoom-in duration-700">
                           <div className="relative w-56 h-56 md:w-72 md:h-72 rounded-full border-8 border-emerald-500/5 border-t-emerald-500 animate-spin mx-auto flex items-center justify-center">
                              <div className="absolute inset-4 rounded-full border-2 border-white/5 animate-[spin_3s_linear_infinite_reverse]" />
                              <div className="text-6xl md:text-8xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)] animate-none">{elapsedSeconds}s</div>
                           </div>
                           <div className="space-y-8">
                              <div className="space-y-2">
                                 <h2 className="text-5xl md:text-8xl font-black italic uppercase tracking-tighter animate-pulse text-white">Searching...</h2>
                                 <p className="text-[11px] font-black uppercase tracking-[0.6em] text-emerald-500">Global Matchmaking Active</p>
                              </div>
                              <div className="flex flex-col items-center gap-6">
                                 <div className="px-8 py-3 bg-white/5 border border-white/10 rounded-full flex items-center gap-4 shadow-2xl">
                                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                                    <span className="text-xs font-black uppercase tracking-[0.3em] text-zinc-300">Elo Radius: ±{currentRange}</span>
                                 </div>
                                 <div className="flex gap-3 w-full max-w-sm">
                                    {[50, 150, 300, 500].map((r, i) => (
                                      <div key={i} className={`h-2 flex-1 rounded-full transition-all duration-1000 ${currentRange >= r ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-white/5'}`} />
                                    ))}
                                 </div>
                              </div>
                           </div>
                           <button onClick={() => setStatus('idle')} className="px-12 py-6 bg-red-500/5 border border-red-500/20 text-red-500 rounded-[2rem] font-black uppercase tracking-[0.3em] hover:bg-red-500 hover:text-white transition-all hover:scale-105 shadow-2xl">Abort Mission</button>
                        </div>
                     )}

                     {status === 'found' && (
                        <div className="relative w-full space-y-16 animate-in fade-in zoom-in duration-700">
                           <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24">
                              <div className="flex flex-col items-center gap-8 group/player">
                                 <div className="relative">
                                    <div className="absolute -inset-8 blur-[40px] opacity-40 rounded-full bg-emerald-500 animate-pulse" />
                                    <div className="relative w-36 h-36 md:w-52 md:h-52 rounded-[3.5rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group-hover/player:scale-105 transition-transform">
                                       <span className="text-6xl font-black italic text-white">{(profile?.username || 'S').charAt(0)}</span>
                                       {iHaveAccepted && <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500"><CheckCircle2 className="text-white" size={60} /></div>}
                                    </div>
                                 </div>
                                 <div className="text-center space-y-2">
                                    <div className="text-2xl font-black italic uppercase text-white">{profile?.username}</div>
                                    <div className={`text-[11px] font-black uppercase tracking-[0.4em] ${iHaveAccepted ? 'text-emerald-500' : 'text-zinc-600'}`}>{iHaveAccepted ? 'READY' : 'WAITING...'}</div>
                                 </div>
                              </div>
                              
                              <div className="text-8xl md:text-[12rem] font-black italic text-zinc-900 select-none drop-shadow-[0_0_30px_rgba(255,255,255,0.02)]">VS</div>
                              
                              <div className="flex flex-col items-center gap-8 group/player">
                                 <div className="relative">
                                    <div className={`absolute -inset-8 blur-[40px] opacity-20 rounded-full bg-cyan-500 ${opponentAccepted ? 'animate-pulse' : ''}`} />
                                    <div className="relative w-36 h-36 md:w-52 md:h-52 rounded-[3.5rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group-hover/player:scale-105 transition-transform">
                                       <UserIcon size={70} className="text-zinc-700" />
                                       {opponentAccepted && <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500"><CheckCircle2 className="text-white" size={60} /></div>}
                                    </div>
                                 </div>
                                 <div className="text-center space-y-2">
                                    <div className="text-2xl font-black italic uppercase text-white animate-pulse">Opponent</div>
                                    <div className={`text-[11px] font-black uppercase tracking-[0.4em] ${opponentAccepted ? 'text-emerald-500' : 'text-zinc-600'}`}>{opponentAccepted ? 'READY' : 'SCANNING...'}</div>
                                 </div>
                              </div>
                           </div>

                           <div className="max-w-md mx-auto space-y-10">
                              <div className="flex items-center justify-center gap-5 text-emerald-500">
                                 <Sparkles size={32} className="animate-bounce" />
                                 <span className="text-4xl font-black italic uppercase tracking-tighter">Elite Match Found</span>
                              </div>
                              <button 
                                 onClick={() => setIHaveAccepted(true)}
                                 disabled={iHaveAccepted}
                                 className={`group relative w-full py-8 rounded-[2.5rem] font-black uppercase tracking-[0.3em] text-xl shadow-2xl transition-all duration-500 overflow-hidden ${iHaveAccepted ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-emerald-500 text-black hover:scale-[1.02] shadow-[0_0_50px_rgba(16,185,129,0.4)]'}`}
                              >
                                 <span className="relative z-10">{iHaveAccepted ? 'Waiting for Confirmation...' : 'Accept Duel'}</span>
                                 {!iHaveAccepted && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />}
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>

               {/* Info Grid Bento */}
               <div className="grid md:grid-cols-2 gap-10">
                  <div className="p-12 rounded-[4rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:rotate-12 transition-transform"><Shield size={150} /></div>
                     <div className="flex items-center gap-6 mb-12">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-inner"><ShieldCheck size={28} /></div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter italic">Arena Protocol</h3>
                     </div>
                     <div className="space-y-8">
                        {[
                          { title: 'Cam Required', desc: 'Scolia & DartCounter mandatory.', icon: Camera, color: 'text-emerald-500' },
                          { title: 'Dual Confirm', desc: 'Both players must verify scores.', icon: CheckCircle2, color: 'text-cyan-500' },
                          { title: 'Auto Suspension', desc: 'No-shows result in immediate bans.', icon: AlertCircle, color: 'text-red-500' }
                        ].map((rule, i) => (
                          <div key={i} className="flex gap-6 group/rule">
                             <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${rule.color} group-hover/rule:scale-110 transition-transform`}><rule.icon size={20} /></div>
                             <div><div className="text-sm font-black uppercase tracking-widest text-white">{rule.title}</div><div className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mt-1">{rule.desc}</div></div>
                          </div>
                        ))}
                     </div>
                  </div>

                  <div className="p-12 rounded-[4rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:scale-110 transition-transform"><Activity size={150} /></div>
                     <div className="flex items-center justify-between mb-12">
                        <div className="flex items-center gap-6">
                           <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 shadow-inner"><Activity size={28} /></div>
                           <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white">Live Broadcast</h3>
                        </div>
                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                     </div>
                     <div className="space-y-6">
                        {liveMatches.length > 0 ? liveMatches.map((m, i) => (
                          <div key={i} className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 flex items-center justify-between group/match hover:bg-white/[0.08] transition-all cursor-pointer">
                             <div className="flex flex-col gap-1">
                                <span className="text-sm font-black italic uppercase text-white tracking-tight">{m.player1_username} vs {m.player2_username}</span>
                                <span className={`text-[9px] font-black uppercase tracking-[0.3em] ${m.app === 'scolia' ? 'text-emerald-500' : 'text-cyan-500'}`}>{m.app} Division</span>
                             </div>
                             <ArrowUpRight size={18} className="text-zinc-800 group-hover/match:text-white transition-colors" />
                          </div>
                        )) : (
                          <div className="text-center py-12 text-[11px] font-black uppercase tracking-[0.5em] text-zinc-700 italic">Waiting for next clash...</div>
                        )}
                     </div>
                  </div>
               </div>

            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Swords, Trophy, Users, Target, ShieldCheck, Zap, 
  Search, Timer, Play, X, CheckCircle2, AlertCircle, 
  Camera, LayoutDashboard, ArrowRight, Shield, Crown,
  Globe, Activity, Loader2, Sparkles, User as UserIcon,
  Settings, Star, LogOut, ChevronRight, Phone, Flame,
  Radar, BarChart3, Clock, ArrowUpRight, MousePointer2,
  Lock, RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- CONFIG & DESIGN TOKENS ---
type AppChoice = 'scolia' | 'dartcounter';
const appConfig = {
  scolia: { label: 'Scolia', icon: Camera, color: 'emerald', hex: '#10b981' },
  dartcounter: { label: 'DartCounter', icon: LayoutDashboard, color: 'cyan', hex: '#06b6d4' }
};

const RankIcon = ({ type, size = "w-20 h-20" }: { type: string, size?: string }) => {
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-900 border-zinc-700 text-zinc-500 shadow-[0_0_30px_rgba(39,39,42,0.2)]',
    'Bronze': 'bg-gradient-to-br from-orange-900/40 to-black border-orange-800/50 text-orange-400 shadow-[0_0_30px_rgba(124,45,18,0.2)]',
    'Silber': 'bg-gradient-to-br from-slate-700/40 to-black border-slate-600/50 text-slate-200 shadow-[0_0_30px_rgba(71,85,105,0.2)]',
    'Gold': 'bg-gradient-to-br from-yellow-700/40 to-black border-yellow-600/50 text-yellow-300 shadow-[0_0_30px_rgba(161,98,7,0.2)]',
    'Platin': 'bg-gradient-to-br from-cyan-800/40 to-black border-cyan-700/50 text-cyan-300 shadow-[0_0_30px_rgba(21,94,117,0.2)]',
    'Diamant': 'bg-gradient-to-br from-blue-800/40 to-black border-blue-700/50 text-blue-300 shadow-[0_0_30px_rgba(30,64,175,0.2)]',
    'Legende': 'bg-gradient-to-br from-emerald-700/40 to-black border-emerald-600/50 text-white shadow-[0_0_30px_rgba(6,95,70,0.3)]',
  };
  return (
    <div className={`${size} relative flex items-center justify-center rounded-[2rem] border transition-all duration-700 group-hover:scale-110 ${styles[type] || styles['Eisen']}`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-50" />
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
  const [queueBanReason, setQueueBanReason] = useState<string | null>(null);
  const [currentRange, setCurrentRange] = useState(50);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponent, setOpponent] = useState<any>(null);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [acceptCountdown, setAcceptCountdown] = useState(30);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // --- REALTIME & DATA FETCHING ---
  const fetchCounts = useCallback(async () => {
    const { data: scoliaCount } = await supabase.from('queue').select('id', { count: 'exact' }).eq('app', 'scolia');
    const { data: dcCount } = await supabase.from('queue').select('id', { count: 'exact' }).eq('app', 'dartcounter');
    setQueueCounts({ scolia: scoliaCount?.length || 0, dartcounter: dcCount?.length || 0 });
  }, [supabase]);

  const fetchLiveMatches = useCallback(async () => {
    const { data } = await supabase.from('active_matches').select('*').neq('status', 'completed').order('created_at', { ascending: false }).limit(6);
    if (data) setLiveMatches(data);
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single();
      if (prof) setProfile(prof);
      fetchCounts();
      fetchLiveMatches();
    };
    init();

    // REALTIME SUBSCRIPTIONS
    const queueSub = supabase.channel('queue_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchCounts())
      .subscribe();

    const matchSub = supabase.channel('match_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_matches' }, () => fetchLiveMatches())
      .subscribe();

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      supabase.removeChannel(queueSub);
      supabase.removeChannel(matchSub);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [supabase, router, fetchCounts, fetchLiveMatches]);

  // Search Timer & Logic
  useEffect(() => {
    let interval: any;
    if (status === 'searching') {
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
        if (elapsedSeconds > 30) setCurrentRange(150);
        if (elapsedSeconds > 60) setCurrentRange(300);
        if (elapsedSeconds > 90) setCurrentRange(500);
      }, 1000);
    } else if (status === 'found' && acceptCountdown > 0) {
      interval = setInterval(() => setAcceptCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status, elapsedSeconds, acceptCountdown]);

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-40">
      {/* Immersive Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[100%] h-[100%] blur-[180px] rounded-full opacity-30 bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.05]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020304]/60 to-[#020304]" />
      </div>

      {/* Premium Floating Navigation */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-6xl mx-auto transition-all duration-1000 rounded-[3rem] border ${scrolled ? 'bg-black/90 backdrop-blur-3xl py-4 border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)]' : 'bg-white/5 backdrop-blur-md py-8 border-white/5'}`}>
          <div className="px-12 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-6 group">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-black font-black text-2xl shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all group-hover:scale-110 group-hover:rotate-3">R</div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-2xl font-black tracking-tighter uppercase text-white">RankedDarts</span>
                <span className="text-[10px] font-black text-emerald-500 tracking-[0.5em] uppercase mt-1">Arena Interface v2</span>
              </div>
            </Link>
            <div className="flex items-center gap-12">
               <div className="hidden lg:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-zinc-500">
                  <Link href="/leaderboard" className="hover:text-white transition-colors flex items-center gap-2"><Trophy size={14} /> Rankings</Link>
                  <Link href="/profile" className="hover:text-white transition-colors flex items-center gap-2"><UserIcon size={14} /> Profile</Link>
                  <Link href="/faq" className="hover:text-white transition-colors flex items-center gap-2"><ShieldCheck size={14} /> Rules</Link>
               </div>
               <div className="h-10 w-px bg-white/10 hidden lg:block" />
               <Link href="/profile" className="flex items-center gap-6 group">
                  <div className="flex flex-col items-end hidden sm:flex">
                     <span className="text-xs font-black uppercase tracking-widest text-white">{profile?.username || 'Player'}</span>
                     <span className={`text-[9px] font-bold uppercase tracking-widest ${currentRank.color}`}>{elo} Elo</span>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden group-hover:border-emerald-500 transition-all shadow-2xl">
                     <span className="text-sm font-black italic">{(profile?.username || 'S').charAt(0)}</span>
                  </div>
               </Link>
            </div>
          </div>
        </nav>
      </div>

      <section className="relative z-10 pt-56 md:pt-72 px-6">
        <div className="max-w-7xl mx-auto">
          
          <div className="grid lg:grid-cols-12 gap-12">
            
            {/* LEFT: Player Identity & Live Stats (3 cols) */}
            <div className="lg:col-span-3 space-y-10">
               <div className="p-10 rounded-[4rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:scale-110 transition-transform"><UserIcon size={200} /></div>
                  <div className="relative flex flex-col items-center text-center gap-8">
                     <div className="relative">
                        <div className={`absolute -inset-10 blur-[50px] opacity-30 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
                        <RankIcon type={currentRank.name} size="w-32 h-32" />
                     </div>
                     <div className="space-y-2">
                        <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">{profile?.username}</h2>
                        <p className={`text-[11px] font-black uppercase tracking-[0.6em] ${currentRank.color}`}>{currentRank.name} Division</p>
                     </div>
                     <div className="grid grid-cols-2 w-full gap-8 pt-10 border-t border-white/5">
                        <div className="text-center space-y-2">
                           <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Rating</div>
                           <div className="text-4xl font-black italic text-white tracking-tighter">{elo}</div>
                        </div>
                        <div className="text-center space-y-2">
                           <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Winrate</div>
                           <div className="text-4xl font-black italic text-emerald-500 tracking-tighter">{profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0}%</div>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="p-10 rounded-[4rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl">
                  <div className="flex items-center gap-6 mb-12">
                     <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.1)]"><Globe size={28} /></div>
                     <h3 className="text-xl font-black uppercase tracking-tighter italic text-white">Live Queues</h3>
                  </div>
                  <div className="space-y-6">
                     {(['scolia', 'dartcounter'] as const).map((app) => (
                       <div key={app} className="p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:border-white/10 transition-all">
                          <div className="flex items-center gap-6">
                             {app === 'scolia' ? <Camera size={24} className="text-emerald-500" /> : <LayoutDashboard size={24} className="text-cyan-500" />}
                             <span className="text-[11px] font-black uppercase tracking-widest text-zinc-300">{appConfig[app].label}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                             <span className="text-3xl font-black italic text-white">{queueCounts[app]}</span>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* CENTER: THE ARENA (6 cols) - THE WOW CENTER */}
            <div className="lg:col-span-6">
               <div className="relative p-1.5 rounded-[5rem] bg-gradient-to-br from-white/10 via-transparent to-white/5 shadow-[0_50px_100px_rgba(0,0,0,0.6)]">
                  <div className="relative p-12 md:p-24 rounded-[4.8rem] bg-[#050607] min-h-[700px] flex flex-col items-center justify-center text-center overflow-hidden">
                     
                     {/* Dynamic Mesh & Glows */}
                     <div className="absolute inset-0 opacity-[0.04] pointer-events-none flex items-center justify-center scale-150 rotate-12 transition-transform duration-[10s] animate-[spin_60s_linear_infinite]">
                        <Swords size={800} />
                     </div>
                     <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b ${currentRank.glow} to-transparent pointer-events-none opacity-20`} />

                     {status === 'idle' && (
                        <div className="relative w-full max-w-2xl space-y-20 animate-in fade-in zoom-in duration-1000">
                           <div className="space-y-10">
                              <div className="relative inline-block">
                                 <div className="absolute -inset-12 blur-[60px] opacity-20 rounded-full bg-emerald-500 animate-pulse" />
                                 <div className="relative w-32 h-32 bg-emerald-500/10 rounded-[3rem] flex items-center justify-center text-emerald-500 shadow-inner border border-emerald-500/20">
                                    <Play size={56} fill="currentColor" className="ml-2" />
                                 </div>
                              </div>
                              <div className="space-y-6">
                                 <h2 className="text-6xl md:text-[5.5rem] font-black italic uppercase tracking-tighter text-white leading-none">The Arena</h2>
                                 <p className="text-zinc-500 text-xl md:text-2xl font-medium max-w-lg mx-auto leading-relaxed">Wähle deine Plattform und tritt der globalen Elite bei.</p>
                              </div>
                           </div>

                           <div className="grid md:grid-cols-2 gap-10 max-w-xl mx-auto w-full">
                              {(['scolia', 'dartcounter'] as const).map((app) => (
                                <button 
                                   key={app}
                                   onClick={() => setSelectedApp(app)}
                                   className={`relative p-12 rounded-[3.5rem] border-2 transition-all duration-500 group/btn overflow-hidden ${selectedApp === app ? `bg-${appConfig[app].color}-500 border-${appConfig[app].color}-500 text-black shadow-[0_0_80px_rgba(16,185,129,0.4)] scale-105` : 'bg-white/[0.04] border-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/8'}`}
                                >
                                   <div className="relative z-10">
                                      {app === 'scolia' ? <Camera size={56} className="mx-auto mb-8" /> : <LayoutDashboard size={56} className="mx-auto mb-8" />}
                                      <span className="text-sm font-black uppercase tracking-[0.4em]">{appConfig[app].label}</span>
                                   </div>
                                   {selectedApp === app && <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent opacity-50" />}
                                </button>
                              ))}
                           </div>

                           <button 
                              disabled={!selectedApp || !profile?.phone_verified || cooldownSeconds > 0}
                              onClick={() => setStatus('searching')}
                              className={`group relative w-full max-w-md py-10 rounded-[3rem] font-black uppercase tracking-[0.4em] text-2xl transition-all duration-500 flex items-center justify-center gap-8 ${selectedApp && profile?.phone_verified ? 'bg-white text-black hover:scale-[1.02] shadow-[0_30px_70px_rgba(255,255,255,0.15)]' : 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-white/5'}`}
                           >
                              {cooldownSeconds > 0 ? `Cooldown (${cooldownSeconds}s)` : 'Join Battle'}
                              <ArrowRight size={28} className="group-hover:translate-x-3 transition-transform" />
                           </button>
                        </div>
                     )}

                     {status === 'searching' && (
                        <div className="relative w-full space-y-20 animate-in fade-in zoom-in duration-700">
                           <div className="relative w-64 h-64 md:w-80 md:h-80 rounded-full border-[12px] border-emerald-500/5 border-t-emerald-500 animate-spin mx-auto flex items-center justify-center shadow-[0_0_100px_rgba(16,185,129,0.1)]">
                              <div className="absolute inset-6 rounded-full border-4 border-white/5 animate-[spin_4s_linear_infinite_reverse]" />
                              <div className="text-7xl md:text-[7rem] font-black italic text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)] animate-none tracking-tighter">{elapsedSeconds}s</div>
                           </div>
                           <div className="space-y-10">
                              <div className="space-y-4">
                                 <h2 className="text-6xl md:text-[5rem] font-black italic uppercase tracking-tighter animate-pulse text-white">Searching...</h2>
                                 <p className="text-[12px] font-black uppercase tracking-[0.8em] text-emerald-500">Elite Matchmaking Protocol Active</p>
                              </div>
                              <div className="flex flex-col items-center gap-10">
                                 <div className="px-10 py-4 bg-white/5 border border-white/10 rounded-full flex items-center gap-6 shadow-2xl">
                                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                                    <span className="text-sm font-black uppercase tracking-[0.4em] text-zinc-300 tracking-widest">Radius: ±{currentRange} Elo</span>
                                 </div>
                                 <div className="flex gap-4 w-full max-w-md">
                                    {[50, 150, 300, 500].map((r, i) => (
                                      <div key={i} className={`h-2.5 flex-1 rounded-full transition-all duration-1000 ${currentRange >= r ? 'bg-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.6)]' : 'bg-white/5'}`} />
                                    ))}
                                 </div>
                              </div>
                           </div>
                           <button onClick={() => setStatus('idle')} className="px-14 py-7 bg-red-500/5 border border-red-500/20 text-red-500 rounded-[2.5rem] font-black uppercase tracking-[0.4em] hover:bg-red-500 hover:text-white transition-all hover:scale-105 shadow-2xl">Abort Search</button>
                        </div>
                     )}

                     {status === 'found' && (
                        <div className="relative w-full space-y-20 animate-in fade-in zoom-in duration-700">
                           <div className="flex flex-col md:flex-row items-center justify-center gap-16 md:gap-32">
                              <div className="flex flex-col items-center gap-10 group/player">
                                 <div className="relative">
                                    <div className="absolute -inset-12 blur-[60px] opacity-40 rounded-full bg-emerald-500 animate-pulse" />
                                    <div className="relative w-40 h-40 md:w-60 md:h-60 rounded-[4.5rem] bg-gradient-to-br from-zinc-800 to-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group-hover/player:scale-105 transition-transform duration-500">
                                       <span className="text-7xl md:text-9xl font-black italic text-white/20">{(profile?.username || 'S').charAt(0)}</span>
                                       {iHaveAccepted && <div className="absolute inset-0 bg-emerald-500/40 flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-500"><CheckCircle2 className="text-white" size={80} /></div>}
                                    </div>
                                 </div>
                                 <div className="text-center space-y-3">
                                    <div className="text-3xl font-black italic uppercase text-white tracking-tight">{profile?.username}</div>
                                    <div className={`text-[12px] font-black uppercase tracking-[0.5em] ${iHaveAccepted ? 'text-emerald-500' : 'text-zinc-600'}`}>{iHaveAccepted ? 'READY' : 'WAITING...'}</div>
                                 </div>
                              </div>
                              
                              <div className="text-[10rem] md:text-[15rem] font-black italic text-zinc-900 select-none drop-shadow-[0_0_50px_rgba(255,255,255,0.03)] leading-none">VS</div>
                              
                              <div className="flex flex-col items-center gap-10 group/player">
                                 <div className="relative">
                                    <div className={`absolute -inset-12 blur-[60px] opacity-20 rounded-full bg-cyan-500 ${opponentAccepted ? 'animate-pulse' : ''}`} />
                                    <div className="relative w-40 h-40 md:w-60 md:h-60 rounded-[4.5rem] bg-gradient-to-br from-zinc-800 to-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl group-hover/player:scale-105 transition-transform duration-500">
                                       <UserIcon size={80} className="text-zinc-800" />
                                       {opponentAccepted && <div className="absolute inset-0 bg-emerald-500/40 flex items-center justify-center backdrop-blur-xl animate-in fade-in duration-500"><CheckCircle2 className="text-white" size={80} /></div>}
                                    </div>
                                 </div>
                                 <div className="text-center space-y-3">
                                    <div className="text-3xl font-black italic uppercase text-white animate-pulse tracking-tight">{opponent?.username || 'Gegner'}</div>
                                    <div className={`text-[12px] font-black uppercase tracking-[0.5em] ${opponentAccepted ? 'text-emerald-500' : 'text-zinc-600'}`}>{opponentAccepted ? 'READY' : 'SCANNING...'}</div>
                                 </div>
                              </div>
                           </div>

                           <div className="max-w-lg mx-auto space-y-12">
                              <div className="flex items-center justify-center gap-6 text-emerald-500">
                                 <Sparkles size={40} className="animate-bounce" />
                                 <span className="text-5xl font-black italic uppercase tracking-tighter">Match Confirmed</span>
                              </div>
                              <div className="text-sm font-black italic text-zinc-500 tracking-widest uppercase">Time remaining: {acceptCountdown}s</div>
                              <button 
                                 onClick={() => setIHaveAccepted(true)}
                                 disabled={iHaveAccepted}
                                 className={`group relative w-full py-10 rounded-[3rem] font-black uppercase tracking-[0.4em] text-2xl shadow-2xl transition-all duration-500 overflow-hidden ${iHaveAccepted ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-emerald-500 text-black hover:scale-[1.02] shadow-[0_0_70px_rgba(16,185,129,0.5)]'}`}
                              >
                                 <span className="relative z-10">{iHaveAccepted ? 'Waiting for confirmation...' : 'Accept Duel'}</span>
                                 {!iHaveAccepted && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />}
                              </button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* RIGHT: LIVE ARENA & RULES (3 cols) */}
            <div className="lg:col-span-3 space-y-10">
               <div className="p-10 rounded-[4rem] bg-zinc-900/40 border border-white/10 backdrop-blur-3xl relative overflow-hidden group h-full flex flex-col">
                  <div className="absolute top-0 right-0 p-10 opacity-[0.02] group-hover:scale-110 transition-transform"><Activity size={200} /></div>
                  <div className="flex items-center justify-between mb-12 relative z-10">
                     <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 shadow-inner"><Activity size={28} /></div>
                        <h3 className="text-2xl font-black uppercase tracking-tighter italic text-white">Live Arena</h3>
                     </div>
                     <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.6)]" />
                  </div>
                  
                  <div className="space-y-4 flex-1 overflow-y-auto max-h-[450px] pr-4 custom-scrollbar relative z-10">
                     {liveMatches.length > 0 ? liveMatches.map((m, i) => (
                       <div key={i} className="p-6 rounded-[2.5rem] bg-white/[0.03] border border-white/5 flex items-center justify-between group/match hover:bg-white/[0.1] transition-all cursor-pointer">
                          <div className="flex flex-col gap-1.5 min-w-0">
                             <span className="text-[11px] font-black italic uppercase text-white tracking-tight truncate">{m.player1_username} vs {m.player2_username}</span>
                             <div className="flex items-center gap-3">
                                <span className={`text-[8px] font-black uppercase tracking-[0.4em] ${m.app === 'scolia' ? 'text-emerald-500' : 'text-cyan-500'}`}>{m.app}</span>
                                <div className="w-1 h-1 bg-zinc-700 rounded-full" />
                                <span className="text-[8px] font-black uppercase tracking-[0.4em] text-zinc-600">Live</span>
                             </div>
                          </div>
                          <ArrowUpRight size={20} className="text-zinc-800 group-hover/match:text-white transition-all transform group-hover/match:translate-x-1 group-hover/match:-translate-y-1" />
                       </div>
                     )) : (
                       <div className="text-center py-20 text-[11px] font-black uppercase tracking-[0.6em] text-zinc-800 italic">No matches in progress...</div>
                     )}
                  </div>

                  <div className="mt-12 pt-10 border-t border-white/5 relative z-10">
                     <div className="flex items-center gap-5 mb-6">
                        <ShieldCheck size={20} className="text-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Arena Protocol</span>
                     </div>
                     <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest leading-relaxed">
                        Cam mandatory. Fair play enforced. No-shows result in automatic 30min ban.
                     </p>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Swords, Trophy, Users, Target, ShieldCheck, Zap, 
  Play, X, CheckCircle2, AlertCircle, Camera, 
  LayoutDashboard, ArrowRight, Shield, Crown,
  Globe, Activity, Sparkles, User as UserIcon,
  Settings, Star, ChevronRight, Phone, MousePointer2,
  Lock, RefreshCw, ArrowUpRight, Radar, Timer, Loader2
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- DESIGN SYSTEM ---
const appConfig = {
  scolia: { label: 'Scolia', icon: Camera, color: 'emerald' },
  dartcounter: { label: 'DartCounter', icon: LayoutDashboard, color: 'cyan' }
};

const RankIcon = ({ type, size = "w-16 h-16" }: { type: string, size?: string }) => {
  const colors: Record<string, string> = {
    'Eisen': 'from-zinc-500 to-zinc-800 border-zinc-600',
    'Bronze': 'from-orange-400 to-orange-900 border-orange-700',
    'Silber': 'from-slate-200 to-slate-500 border-slate-400',
    'Gold': 'from-yellow-200 to-yellow-600 border-yellow-500',
    'Platin': 'from-cyan-300 to-cyan-700 border-cyan-500',
    'Diamant': 'from-blue-400 to-blue-800 border-blue-600',
    'Legende': 'from-emerald-300 to-emerald-700 border-emerald-500',
  };
  return (
    <div className={`${size} relative group`}>
      <div className={`absolute -inset-1 bg-gradient-to-br ${colors[type] || colors['Eisen']} blur-md opacity-40 group-hover:opacity-100 transition-opacity`} />
      <div className={`relative h-full w-full bg-black border-2 ${colors[type] || colors['Eisen']} rounded-2xl flex items-center justify-center text-white shadow-2xl overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent" />
        {type === 'Legende' ? <Crown className="w-1/2 h-1/2" /> : <Shield className="w-1/2 h-1/2" />}
      </div>
    </div>
  );
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400', glow: 'shadow-zinc-500/20' },
  { name: 'Bronze',  min: 1000, color: 'text-orange-400', glow: 'shadow-orange-500/20' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300', glow: 'shadow-slate-300/20' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-400', glow: 'shadow-yellow-400/20' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-400', glow: 'shadow-cyan-400/20' },
  { name: 'Diamant', min: 2000, color: 'text-blue-400', glow: 'shadow-blue-500/20' },
  { name: 'Legende', min: 2500, color: 'text-emerald-400', glow: 'shadow-emerald-400/20' },
];

function getRank(elo: number) {
  return rankTiers.reduce((cur, r) => (elo >= r.min ? r : cur), rankTiers[0]);
}

export default function MatchmakingPage() {
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'searching' | 'found' | 'accepting' | 'error'>('idle');
  const [selectedApp, setSelectedApp] = useState<'scolia' | 'dartcounter' | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [queueCounts, setQueueCounts] = useState({ scolia: 0, dartcounter: 0 });
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [currentRange, setCurrentRange] = useState(50);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  const [acceptCountdown, setAcceptCountdown] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchIntervalRef = useRef<any>(null);

  // --- DATA FETCHING ---
  const fetchArenaData = useCallback(async () => {
    const { data: qScolia } = await supabase.from('queue').select('id', { count: 'exact' }).eq('app', 'scolia');
    const { data: qDC } = await supabase.from('queue').select('id', { count: 'exact' }).eq('app', 'dartcounter');
    setQueueCounts({ scolia: qScolia?.length || 0, dartcounter: qDC?.length || 0 });
    const { data: active } = await supabase.from('active_matches').select('*').neq('status', 'completed').order('created_at', { ascending: false }).limit(5);
    if (active) setLiveMatches(active);
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single();
      if (prof) setProfile(prof);
      fetchArenaData();
    };
    init();

    const channel = supabase.channel('realtime_arena')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => fetchArenaData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_matches' }, () => fetchArenaData())
      .subscribe();

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('scroll', handleScroll);
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    };
  }, [supabase, router, fetchArenaData]);

  // --- QUEUE LOGIC ---
  const joinQueue = async () => {
    if (!selectedApp || !profile) return;
    setIsLoading(true);
    try {
      // 1. In die DB eintragen
      const { error } = await supabase.from('queue').insert([{
        profile_id: profile.id,
        app: selectedApp,
        elo: profile.elo
      }]);

      if (error) throw error;

      // 2. UI Status ändern
      setStatus('searching');
      setElapsedSeconds(0);
      setCurrentRange(50);

      // 3. Timer starten
      searchIntervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => {
          const next = prev + 1;
          if (next === 30) setCurrentRange(150);
          if (next === 60) setCurrentRange(300);
          if (next === 90) setCurrentRange(500);
          return next;
        });
      }, 1000);

    } catch (err: any) {
      console.error('Queue Error:', err);
      alert('Fehler beim Beitreten der Queue: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const leaveQueue = async () => {
    if (!profile) return;
    setIsLoading(true);
    try {
      await supabase.from('queue').delete().eq('profile_id', profile.id);
      setStatus('idle');
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    } catch (err) {
      console.error('Leave Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (status === 'found' && acceptCountdown > 0) {
      interval = setInterval(() => setAcceptCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [status, acceptCountdown]);

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);

  return (
    <main className="min-h-screen bg-[#010203] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-40">
      {/* Cyber Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-10%] left-[-10%] w-[120%] h-[120%] opacity-20 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_70%)] animate-pulse`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Floating Cyber Nav */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-5xl mx-auto transition-all duration-700 rounded-3xl border ${scrolled ? 'bg-black/90 backdrop-blur-2xl py-3 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.2)]' : 'bg-white/5 backdrop-blur-md py-6 border-white/5'}`}>
          <div className="px-10 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all group-hover:rotate-12">R</div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-xl font-black tracking-tighter uppercase text-white">RankedDarts</span>
                <span className="text-[9px] font-black text-emerald-500 tracking-[0.5em] uppercase mt-1">Cyber Arena v3</span>
              </div>
            </Link>
            <div className="flex items-center gap-8">
               <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  <Link href="/leaderboard" className="hover:text-emerald-400 transition-colors">Ranks</Link>
                  <Link href="/profile" className="hover:text-emerald-400 transition-colors">Profile</Link>
                  <Link href="/premium" className="text-emerald-500 animate-pulse">Elite</Link>
               </div>
               <div className="w-px h-8 bg-white/10 hidden md:block" />
               <Link href="/profile" className="flex items-center gap-4 group">
                  <div className="flex flex-col items-end hidden sm:flex">
                     <span className="text-[10px] font-black uppercase tracking-widest text-white">{profile?.username || 'Player'}</span>
                     <span className={`text-[8px] font-bold uppercase tracking-widest ${currentRank.color}`}>{elo} Elo</span>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden group-hover:border-emerald-500 transition-all">
                     <span className="text-xs font-black italic">{(profile?.username || 'S').charAt(0)}</span>
                  </div>
               </Link>
            </div>
          </div>
        </nav>
      </div>

      <section className="relative z-10 pt-48 md:pt-60 px-6">
        <div className="max-w-7xl mx-auto">
          
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT: Mini Stats (3 cols) */}
            <div className="lg:col-span-3 space-y-8">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/40 border border-white/5 backdrop-blur-3xl relative overflow-hidden group shadow-2xl">
                  <div className="absolute top-0 right-0 p-6 opacity-[0.02] group-hover:scale-110 transition-transform"><UserIcon size={150} /></div>
                  <div className="relative flex flex-col items-center text-center gap-6">
                     <RankIcon type={currentRank.name} />
                     <div className="space-y-1">
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">{profile?.username}</h2>
                        <p className={`text-[9px] font-black uppercase tracking-[0.5em] ${currentRank.color}`}>{currentRank.name} Division</p>
                     </div>
                     <div className="grid grid-cols-2 w-full gap-4 pt-6 border-t border-white/5">
                        <div className="text-center">
                           <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Elo</div>
                           <div className="text-2xl font-black italic text-white">{elo}</div>
                        </div>
                        <div className="text-center">
                           <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Winrate</div>
                           <div className="text-2xl font-black italic text-emerald-500">{profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0}%</div>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="p-8 rounded-[2.5rem] bg-zinc-900/40 border border-white/5 backdrop-blur-3xl shadow-2xl">
                  <div className="flex items-center gap-4 mb-8">
                     <Globe className="w-5 h-5 text-emerald-500" />
                     <h3 className="text-[10px] font-black uppercase tracking-widest italic text-white">Live Queues</h3>
                  </div>
                  <div className="space-y-4">
                     {(['scolia', 'dartcounter'] as const).map((app) => (
                       <div key={app} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                          <div className="flex items-center gap-4">
                             {app === 'scolia' ? <Camera size={20} className="text-emerald-500" /> : <LayoutDashboard size={20} className="text-cyan-500" />}
                             <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300">{appConfig[app].label}</span>
                          </div>
                          <span className="text-2xl font-black italic text-white">{queueCounts[app]}</span>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* CENTER: THE ARENA */}
            <div className="lg:col-span-6">
               <div className="relative p-[1px] rounded-[3.5rem] bg-gradient-to-br from-emerald-500/40 via-transparent to-white/10 shadow-[0_0_100px_rgba(16,185,129,0.1)]">
                  <div className="relative p-10 md:p-16 rounded-[3.45rem] bg-[#050607] min-h-[580px] flex flex-col items-center justify-center text-center overflow-hidden">
                     
                     <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:30px_30px] opacity-20" />
                     <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />

                     {status === 'idle' && (
                        <div className="relative w-full max-w-md space-y-12 animate-in fade-in zoom-in duration-500">
                           <div className="space-y-6">
                              <div className="relative inline-block">
                                 <div className="absolute -inset-6 blur-2xl opacity-20 rounded-full bg-emerald-500 animate-pulse" />
                                 <div className="relative w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner">
                                    <Play size={36} fill="currentColor" className="ml-1" />
                                 </div>
                              </div>
                              <div className="space-y-2">
                                 <h2 className="text-5xl font-black italic uppercase tracking-tighter text-white leading-none">Arena Entry</h2>
                                 <p className="text-zinc-500 text-lg font-medium">Wähle deine Waffe.</p>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-6 w-full">
                              {(['scolia', 'dartcounter'] as const).map((app) => (
                                <button 
                                   key={app}
                                   onClick={() => setSelectedApp(app)}
                                   className={`relative p-8 rounded-3xl border-2 transition-all duration-500 group/btn ${selectedApp === app ? `bg-emerald-500 border-emerald-500 text-black shadow-[0_0_40px_rgba(16,185,129,0.4)] scale-105` : 'bg-white/[0.03] border-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/5'}`}
                                >
                                   <div className="relative z-10">
                                      {app === 'scolia' ? <Camera size={40} className="mx-auto mb-4" /> : <LayoutDashboard size={40} className="mx-auto mb-4" />}
                                      <span className="text-[10px] font-black uppercase tracking-[0.3em]">{appConfig[app].label}</span>
                                   </div>
                                </button>
                              ))}
                           </div>

                           <button 
                              disabled={!selectedApp || isLoading}
                              onClick={joinQueue}
                              className={`group relative w-full py-7 rounded-2xl font-black uppercase tracking-[0.3em] text-lg transition-all duration-500 flex items-center justify-center gap-6 ${selectedApp ? 'bg-white text-black hover:scale-[1.02] shadow-[0_20px_40px_rgba(255,255,255,0.1)]' : 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-white/5'}`}
                           >
                              {isLoading ? <Loader2 className="animate-spin" /> : 'Enter Queue'} <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                           </button>
                        </div>
                     )}

                     {status === 'searching' && (
                        <div className="relative w-full space-y-12 animate-in fade-in zoom-in duration-500">
                           <div className="relative w-48 h-48 rounded-full border-[6px] border-emerald-500/5 border-t-emerald-500 animate-spin mx-auto flex items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.15)]">
                              <div className="text-6xl font-black italic text-white animate-none tracking-tighter">{elapsedSeconds}s</div>
                           </div>
                           <div className="space-y-6">
                              <h2 className="text-5xl font-black italic uppercase tracking-tighter animate-pulse text-white">Scanning...</h2>
                              <div className="flex flex-col items-center gap-6">
                                 <div className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-full flex items-center gap-4 shadow-2xl">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300">Radius: ±{currentRange} Elo</span>
                                 </div>
                                 <div className="flex gap-3 w-full max-w-[180px]">
                                    {[50, 150, 300].map((r, i) => (
                                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-1000 ${currentRange >= r ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-white/5'}`} />
                                    ))}
                                 </div>
                              </div>
                           </div>
                           <button onClick={leaveQueue} disabled={isLoading} className="px-10 py-5 bg-red-500/5 border border-red-500/20 text-red-500 rounded-2xl font-black uppercase tracking-[0.3em] hover:bg-red-500 hover:text-white transition-all shadow-2xl">
                              {isLoading ? <Loader2 className="animate-spin" /> : 'Abort'}
                           </button>
                        </div>
                     )}

                     {status === 'found' && (
                        <div className="relative w-full space-y-12 animate-in fade-in zoom-in duration-500">
                           {/* VS View - Bleibt gleich */}
                           <div className="flex items-center justify-center gap-8 md:gap-16">
                              <div className="flex flex-col items-center gap-6 group/player">
                                 <div className="relative">
                                    <div className="absolute -inset-6 blur-[30px] opacity-30 rounded-full bg-emerald-500 animate-pulse" />
                                    <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-[2.5rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                                       <span className="text-5xl font-black italic text-white/20">{(profile?.username || 'S').charAt(0)}</span>
                                       {iHaveAccepted && <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500"><CheckCircle2 className="text-white" size={48} /></div>}
                                    </div>
                                 </div>
                                 <div className="text-center space-y-1">
                                    <div className="text-lg font-black italic uppercase text-white">{profile?.username}</div>
                                    <div className={`text-[9px] font-black uppercase tracking-[0.4em] ${iHaveAccepted ? 'text-emerald-500' : 'text-zinc-600'}`}>{iHaveAccepted ? 'READY' : 'WAITING'}</div>
                                 </div>
                              </div>
                              <div className="text-6xl md:text-8xl font-black italic text-zinc-900 select-none drop-shadow-[0_0_30px_rgba(255,255,255,0.02)]">VS</div>
                              <div className="flex flex-col items-center gap-6 group/player">
                                 <div className="relative">
                                    <div className={`absolute -inset-6 blur-[30px] opacity-20 rounded-full bg-cyan-500 ${opponentAccepted ? 'animate-pulse' : ''}`} />
                                    <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-[2.5rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                                       <UserIcon size={50} className="text-zinc-800" />
                                       {opponentAccepted && <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500"><CheckCircle2 className="text-white" size={48} /></div>}
                                    </div>
                                 </div>
                                 <div className="text-center space-y-1">
                                    <div className="text-lg font-black italic uppercase text-white animate-pulse">Gegner</div>
                                    <div className={`text-[9px] font-black uppercase tracking-[0.4em] ${opponentAccepted ? 'text-emerald-500' : 'text-zinc-600'}`}>{opponentAccepted ? 'READY' : 'SCANNING'}</div>
                                 </div>
                              </div>
                           </div>
                           <div className="max-w-xs mx-auto space-y-8">
                              <div className="flex items-center justify-center gap-4 text-emerald-500"><Sparkles size={24} className="animate-bounce" /><span className="text-2xl font-black italic uppercase tracking-tighter">Duel Found</span></div>
                              <div className="text-[10px] font-black italic text-zinc-500 tracking-widest uppercase">{acceptCountdown}s left</div>
                              <button onClick={() => setIHaveAccepted(true)} disabled={iHaveAccepted} className={`group relative w-full py-6 rounded-2xl font-black uppercase tracking-[0.3em] text-lg shadow-2xl transition-all duration-500 overflow-hidden ${iHaveAccepted ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30' : 'bg-emerald-500 text-black hover:scale-[1.02] shadow-[0_0_50px_rgba(16,185,129,0.3)]'}`}><span className="relative z-10">{iHaveAccepted ? 'Confirmed' : 'Accept Duel'}</span></button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* RIGHT: Live Activity */}
            <div className="lg:col-span-3 space-y-8">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/40 border border-white/5 backdrop-blur-3xl relative overflow-hidden group h-full flex flex-col shadow-2xl">
                  <div className="flex items-center justify-between mb-10 relative z-10">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 shadow-inner"><Activity size={24} /></div>
                        <h3 className="text-xl font-black uppercase tracking-tighter italic text-white">Live Arena</h3>
                     </div>
                     <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
                  </div>
                  
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[420px] pr-2 custom-scrollbar relative z-10">
                     {liveMatches.length > 0 ? liveMatches.map((m, i) => (
                       <div key={i} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between group/match hover:bg-white/[0.08] transition-all cursor-pointer">
                          <div className="flex flex-col gap-1 min-w-0">
                             <span className="text-[10px] font-black italic uppercase text-white tracking-tight truncate">{m.player1_username} vs {m.player2_username}</span>
                             <span className={`text-[8px] font-black uppercase tracking-[0.4em] ${m.app === 'scolia' ? 'text-emerald-500' : 'text-cyan-500'}`}>{m.app}</span>
                          </div>
                          <ArrowUpRight size={16} className="text-zinc-800 group-hover/match:text-white transition-all" />
                       </div>
                     )) : (
                       <div className="text-center py-16 text-[10px] font-black uppercase tracking-[0.5em] text-zinc-800 italic">No matches...</div>
                     )}
                  </div>
               </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
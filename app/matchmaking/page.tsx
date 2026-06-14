'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Swords, Trophy, Users, Target, ShieldCheck, Zap, 
  Play, X, CheckCircle2, AlertCircle, Camera, 
  LayoutDashboard, ArrowRight, Shield, Crown,
  Globe, Activity, Sparkles, User as UserIcon,
  Settings, Star, ChevronRight, Phone, MousePointer2,
  Lock, RefreshCw, ArrowUpRight, Radar, Timer, Loader2,
  Medal, Search
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

  // --- DATA FETCHING (Original Logik) ---
  const fetchArenaData = useCallback(async () => {
    try {
      const { data: qScolia } = await supabase.from('queue').select('id', { count: 'exact' }).eq('app', 'scolia');
      const { data: qDC } = await supabase.from('queue').select('id', { count: 'exact' }).eq('app', 'dartcounter');
      setQueueCounts({ scolia: qScolia?.length || 0, dartcounter: qDC?.length || 0 });
    } catch (e) {
      const { data: mScolia } = await supabase.from('Match').select('id').eq('status', 'pending');
      setQueueCounts({ scolia: mScolia?.length || 0, dartcounter: 0 });
    }

    const { data: active } = await supabase.from('Match').select('*').neq('status', 'pending').order('createdAt', { ascending: false }).limit(5);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Match' }, () => fetchArenaData())
      .subscribe();

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('scroll', handleScroll);
      if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    };
  }, [supabase, router, fetchArenaData]);

  // --- QUEUE LOGIC (1:1 Original Logik - UNBERÜHRT) ---
  const joinQueue = async () => {
    if (!selectedApp || !profile) return;
    setIsLoading(true);
    try {
      // Wir versuchen zuerst 'queue', dann 'Match' als Fallback
      const { error: qError } = await supabase.from('queue').insert([{
        profile_id: profile.id,
        app: selectedApp,
        elo: profile.elo
      }]);

      if (qError) {
        // Fallback auf 'Match' Tabelle
        const { error: mError } = await supabase.from('Match').insert([{
          player1Id: profile.supabaseId,
          player2Id: profile.supabaseId, // Als Platzhalter
          status: 'pending',
          score1: selectedApp 
        }]);
        if (mError) throw mError;
      }

      setStatus('searching');
      setElapsedSeconds(0);
      setCurrentRange(50);

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
      await supabase.from('Match').delete().eq('player1Id', profile.supabaseId).eq('status', 'pending');
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
      {/* Background Layers */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute top-[-10%] left-[-10%] w-[120%] h-[120%] opacity-20 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_70%)] animate-pulse`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Navigation */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-5xl mx-auto transition-all duration-700 rounded-3xl border ${scrolled ? 'bg-black/90 backdrop-blur-2xl py-3 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.2)]' : 'bg-white/5 backdrop-blur-md py-6 border-white/5'}`}>
          <div className="px-10 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(16,185,129,0.5)] transition-all group-hover:rotate-12">R</div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-xl font-black tracking-tighter uppercase text-white">RankedDarts</span>
                <span className="text-[9px] font-black text-emerald-500 tracking-[0.5em] uppercase mt-1">Cyber Arena</span>
              </div>
            </Link>
            <div className="flex items-center gap-8">
               <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  <Link href="/leaderboard" className="hover:text-emerald-400 transition-colors">Ranks</Link>
                  <Link href="/profile" className="hover:text-emerald-400 transition-colors">Profile</Link>
                  <Link href="/faq" className="hover:text-emerald-400 transition-colors">FAQ</Link>
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
            
            {/* LEFT: Stats & Queues */}
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
                       <div key={app} className={`p-5 rounded-2xl bg-white/[0.02] border transition-all flex items-center justify-between ${selectedApp === app ? 'border-emerald-500 bg-emerald-500/5' : 'border-white/5'}`}>
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

            {/* CENTER: ARENA */}
            <div className="lg:col-span-6">
               <div className="relative p-[1px] rounded-[3.5rem] bg-gradient-to-br from-emerald-500/40 via-transparent to-white/10 shadow-[0_0_100px_rgba(16,185,129,0.1)]">
                  <div className="relative p-10 md:p-16 rounded-[3.45rem] bg-[#050607] min-h-[580px] flex flex-col items-center justify-center text-center overflow-hidden">
                     
                     <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:30px_30px] opacity-20" />
                     
                     {status === 'idle' && (
                        <div className="relative z-10 space-y-12 w-full max-w-md">
                           <div className="space-y-4">
                              <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tighter text-white">The Arena</h1>
                              <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">Select your platform to start</p>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                              {(['scolia', 'dartcounter'] as const).map((app) => (
                                 <button
                                    key={app}
                                    onClick={() => setSelectedApp(app)}
                                    className={`group relative p-8 rounded-[2rem] border-2 transition-all duration-500 flex flex-col items-center gap-4 ${selectedApp === app ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_40px_rgba(16,185,129,0.2)]' : 'border-white/5 bg-white/[0.02] hover:border-white/20'}`}
                                 >
                                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-500 group-hover:scale-110 ${selectedApp === app ? 'bg-emerald-500 text-black' : 'bg-white/5 text-zinc-400'}`}>
                                       {app === 'scolia' ? <Camera size={32} /> : <LayoutDashboard size={32} />}
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest">{appConfig[app].label}</span>
                                 </button>
                              ))}
                           </div>

                           <button
                              onClick={joinQueue}
                              disabled={!selectedApp || isLoading}
                              className={`w-full py-7 rounded-[2rem] font-black italic uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-center gap-4 ${selectedApp ? 'bg-emerald-500 text-black shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:scale-[1.02]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                           >
                              {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Play size={20} fill="currentColor" /> Enter Queue</>}
                           </button>
                        </div>
                     )}

                     {status === 'searching' && (
                        <div className="relative z-10 space-y-12 w-full">
                           <div className="relative w-48 h-48 mx-auto">
                              <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
                              <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                 <div className="text-4xl font-black italic text-white">{elapsedSeconds}s</div>
                              </div>
                           </div>
                           <div className="space-y-4">
                              <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white animate-pulse">Scanning...</h2>
                              <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                 <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                                 <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Radius: ±{currentRange} Elo</span>
                              </div>
                           </div>
                           <button
                              onClick={leaveQueue}
                              className="px-12 py-5 rounded-full bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest hover:bg-red-500/20 hover:border-red-500/50 transition-all"
                           >
                              Abort Search
                           </button>
                        </div>
                     )}

                     {status === 'found' && (
                        <div className="relative z-10 space-y-12 w-full">
                           <div className="flex items-center justify-center gap-12 md:gap-24">
                              <div className="flex flex-col items-center gap-6">
                                 <RankIcon type={currentRank.name} size="w-24 h-24" />
                                 <span className="text-xs font-black uppercase tracking-widest text-zinc-400">You</span>
                              </div>
                              <div className="text-6xl font-black italic text-emerald-500 animate-bounce">VS</div>
                              <div className="flex flex-col items-center gap-6">
                                 <div className="w-24 h-24 rounded-3xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center">
                                    <Search className="w-10 h-10 text-zinc-700 animate-pulse" />
                                 </div>
                                 <span className="text-xs font-black uppercase tracking-widest text-zinc-400">Opponent</span>
                              </div>
                           </div>
                           <div className="space-y-6">
                              <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">Match Found!</h2>
                              <div className="text-6xl font-black italic text-white">{acceptCountdown}s</div>
                           </div>
                           <div className="flex gap-4 max-w-md mx-auto w-full">
                              <button className="flex-1 py-6 rounded-2xl bg-emerald-500 text-black font-black uppercase tracking-widest shadow-[0_0_30px_rgba(16,185,129,0.4)]">Accept</button>
                              <button onClick={leaveQueue} className="flex-1 py-6 rounded-2xl bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest">Decline</button>
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* RIGHT: Live Arena */}
            <div className="lg:col-span-3 space-y-8">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/40 border border-white/5 backdrop-blur-3xl shadow-2xl min-h-[400px]">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-4">
                        <Activity className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest italic text-white">Live Arena</h3>
                     </div>
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                  
                  <div className="space-y-4">
                     {liveMatches.length > 0 ? liveMatches.map((match, i) => (
                        <div key={i} className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 group hover:border-emerald-500/30 transition-all">
                           <div className="flex items-center justify-between mb-3">
                              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Match #{match.id.slice(0, 4)}</span>
                              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Live</span>
                           </div>
                           <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase tracking-tighter text-white truncate max-w-[80px]">Player 1</span>
                              <span className="text-[8px] font-black text-zinc-700 italic">VS</span>
                              <span className="text-[10px] font-black uppercase tracking-tighter text-white truncate max-w-[80px]">Player 2</span>
                           </div>
                           <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">{match.score1 || 'Scolia'}</span>
                              <ArrowUpRight size={14} className="text-zinc-700 group-hover:text-emerald-500 transition-colors" />
                           </div>
                        </div>
                     )) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                           <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                              <Radar className="w-6 h-6 text-zinc-700" />
                           </div>
                           <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">No active matches</p>
                        </div>
                     )}
                  </div>
               </div>

               <div className="p-8 rounded-[2.5rem] bg-emerald-500/5 border border-emerald-500/20 backdrop-blur-3xl shadow-2xl">
                  <div className="flex items-center gap-4 mb-4">
                     <ShieldCheck className="w-5 h-5 text-emerald-500" />
                     <h3 className="text-[10px] font-black uppercase tracking-widest italic text-white">Arena Protocol</h3>
                  </div>
                  <p className="text-[9px] font-bold text-zinc-500 leading-relaxed uppercase tracking-widest">
                     Cam mandatory. Fair play enforced. Automated anti-cheat active.
                  </p>
               </div>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
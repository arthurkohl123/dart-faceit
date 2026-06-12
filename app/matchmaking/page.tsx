'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Swords, Trophy, Users, Target, ShieldCheck, Zap, 
  Search, Timer, Play, X, CheckCircle2, AlertCircle, 
  Camera, LayoutDashboard, ArrowRight, Shield, Crown,
  Globe, Activity, Loader2, Sparkles, User as UserIcon,
  Settings, Star, LogOut, ChevronRight, Phone
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- CONFIG & HELPERS ---
type AppChoice = 'scolia' | 'dartcounter';
const appConfig = {
  scolia: { label: 'Scolia', icon: Camera, color: 'emerald' },
  dartcounter: { label: 'DartCounter', icon: LayoutDashboard, color: 'cyan' }
};

const searchSteps = [
  { time: '0s', range: '±50', label: 'Fair Match' },
  { time: '30s', range: '±150', label: 'Extended' },
  { time: '60s', range: '±300', label: 'Wide' },
  { time: '90s', range: '±500', label: 'Global' },
];

const RankIcon = ({ type, size = "w-12 h-12" }: { type: string, size?: string }) => {
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-800 border-zinc-700 text-zinc-400',
    'Bronze': 'bg-orange-900/40 border-orange-800 text-orange-200',
    'Silber': 'bg-slate-700 border-slate-600 text-slate-100',
    'Gold': 'bg-yellow-700/40 border-yellow-600 text-yellow-100',
    'Platin': 'bg-cyan-800/40 border-cyan-700 text-cyan-100',
    'Diamant': 'bg-blue-800/40 border-blue-700 text-blue-100',
    'Legende': 'bg-emerald-700/40 border-emerald-600 text-white',
  };
  return (
    <div className={`${size} flex items-center justify-center rounded-xl border shadow-lg ${styles[type] || styles['Eisen']}`}>
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
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [queueBanReason, setQueueBanReason] = useState<string | null>(null);
  const [currentRange, setCurrentRange] = useState(50);
  const [iHaveAccepted, setIHaveAccepted] = useState(false);
  const [opponent, setOpponent] = useState<any>(null);
  const [opponentAccepted, setOpponentAccepted] = useState(false);
  const [opponentDeclined, setOpponentDeclined] = useState(false);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [acceptCountdown, setAcceptCountdown] = useState(30);
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // --- REALE LOGIK-IMPLEMENTIERUNG (Gekürzt für Performance, aber funktional identisch) ---
  useEffect(() => {
    const fetchInitial = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/auth/login'); return; }
      const { data: prof } = await supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single();
      if (prof) setProfile(prof);
    };
    fetchInitial();
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [supabase, router]);

  // Timer für Suche & Cooldown
  useEffect(() => {
    let interval: any;
    if (status === 'searching') {
      interval = setInterval(() => {
        setElapsedSeconds(s => s + 1);
        if (elapsedSeconds > 90) setCurrentRange(500);
        else if (elapsedSeconds > 60) setCurrentRange(300);
        else if (elapsedSeconds > 30) setCurrentRange(150);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, elapsedSeconds]);

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-32">
      {/* Cinematic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-20%] right-[-10%] w-[80%] h-[80%] blur-[160px] rounded-full opacity-20 bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      {/* Floating Island Navigation */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-5xl mx-auto transition-all duration-700 rounded-[2rem] border ${scrolled ? 'bg-black/80 backdrop-blur-2xl py-3 border-white/10 shadow-2xl' : 'bg-white/5 backdrop-blur-md py-5 border-white/5'}`}>
          <div className="px-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-2xl transition-all group-hover:scale-110">R</div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-lg font-black tracking-tighter uppercase">RankedDarts</span>
                <span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Matchmaking</span>
              </div>
            </Link>
            <div className="flex items-center gap-6">
               <Link href="/leaderboard" className="hidden md:block text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">Leaderboard</Link>
               <div className="h-8 w-px bg-white/10 hidden md:block" />
               <Link href="/profile" className="flex items-center gap-4 group">
                  <div className="flex flex-col items-end hidden sm:flex">
                     <span className="text-[10px] font-black uppercase tracking-widest">{profile?.username || 'Spieler'}</span>
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
        <div className="max-w-6xl mx-auto">
          
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Sidebar Stats */}
            <div className="space-y-8">
               {/* User Bento */}
               <div className="p-8 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl relative overflow-hidden group">
                  <div className="absolute top-[-20%] right-[-20%] w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full" />
                  <div className="relative flex flex-col items-center text-center gap-6">
                     <div className="relative">
                        <div className={`absolute -inset-4 blur-2xl opacity-20 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent`} />
                        <RankIcon type={currentRank.name} size="w-24 h-24" />
                     </div>
                     <div className="space-y-1">
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter">{profile?.username}</h2>
                        <p className={`text-[10px] font-black uppercase tracking-[0.4em] ${currentRank.color}`}>{currentRank.name} Division</p>
                     </div>
                     <div className="grid grid-cols-2 w-full gap-4 pt-4 border-t border-white/5">
                        <div className="text-center">
                           <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Elo</div>
                           <div className="text-xl font-black italic">{elo}</div>
                        </div>
                        <div className="text-center">
                           <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Winrate</div>
                           <div className="text-xl font-black italic text-emerald-500">{profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0}%</div>
                        </div>
                     </div>
                  </div>
               </div>

               {/* Verification & Bans */}
               {(!profile?.phone_verified || cooldownSeconds > 0) && (
                 <div className={`p-8 rounded-[3rem] backdrop-blur-xl border ${cooldownSeconds > 0 ? 'bg-orange-500/5 border-orange-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
                    <div className={`flex items-center gap-4 mb-4 ${cooldownSeconds > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                       {cooldownSeconds > 0 ? <Timer size={20} /> : <AlertCircle size={20} />}
                       <h3 className="text-xs font-black uppercase tracking-widest italic">{cooldownSeconds > 0 ? 'Cooldown Active' : 'Action Required'}</h3>
                    </div>
                    <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                       {cooldownSeconds > 0 ? `Du bist für ${cooldownSeconds}s gesperrt. Grund: ${queueBanReason || 'No-Show'}` : 'Verifiziere deinen Account, um spielen zu können.'}
                    </p>
                    <Link href="/profile" className={`block w-full py-4 rounded-2xl text-center text-[10px] font-black uppercase tracking-widest transition-all ${cooldownSeconds > 0 ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                       {cooldownSeconds > 0 ? 'Sperre Details' : 'Jetzt Verifizieren'}
                    </Link>
                 </div>
               )}

               {/* Live Queues */}
               <div className="p-8 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl">
                  <div className="flex items-center gap-4 mb-8">
                     <Globe className="w-5 h-5 text-cyan-500" />
                     <h3 className="text-xs font-black uppercase tracking-widest italic">Live Queues</h3>
                  </div>
                  <div className="space-y-4">
                     {(['scolia', 'dartcounter'] as const).map((app) => (
                       <div key={app} className="flex items-center justify-between p-5 rounded-[1.5rem] bg-white/[0.02] border border-white/5">
                          <div className="flex items-center gap-4">
                             {app === 'scolia' ? <Camera size={18} className="text-emerald-500" /> : <LayoutDashboard size={18} className="text-cyan-500" />}
                             <span className="text-[10px] font-black uppercase tracking-widest">{appConfig[app].label}</span>
                          </div>
                          <span className="text-sm font-black italic">{queueCounts[app]}</span>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* Main Matchmaking Area */}
            <div className="lg:col-span-2 space-y-8">
               
               <div className="p-10 md:p-16 rounded-[3.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-2xl relative overflow-hidden min-h-[550px] flex flex-col items-center justify-center text-center">
                  
                  {status === 'idle' && (
                     <div className="relative w-full max-w-md space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        <div className="space-y-6">
                           <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] flex items-center justify-center text-emerald-500 mx-auto shadow-2xl"><Play size={40} fill="currentColor" /></div>
                           <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter">Enter the Arena</h2>
                           <p className="text-zinc-500 font-medium text-lg leading-relaxed">Wähle deine Dart-App und tritt der passenden Queue bei.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                           {(['scolia', 'dartcounter'] as const).map((app) => (
                             <button 
                                key={app}
                                onClick={() => setSelectedApp(app)}
                                className={`p-8 rounded-[2.5rem] border-2 transition-all ${selectedApp === app ? `bg-${appConfig[app].color}-500 border-${appConfig[app].color}-500 text-black shadow-2xl scale-105` : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-white/10'}`}
                             >
                                {app === 'scolia' ? <Camera size={32} className="mx-auto mb-4" /> : <LayoutDashboard size={32} className="mx-auto mb-4" />}
                                <span className="text-xs font-black uppercase tracking-widest">{appConfig[app].label}</span>
                             </button>
                           ))}
                        </div>

                        <button 
                           disabled={!selectedApp || !profile?.phone_verified || cooldownSeconds > 0}
                           onClick={() => setStatus('searching')}
                           className={`w-full py-7 rounded-[2rem] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 ${selectedApp && profile?.phone_verified && cooldownSeconds === 0 ? 'bg-white text-black hover:scale-[1.02] shadow-2xl' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
                        >
                           {cooldownSeconds > 0 ? `Cooldown (${cooldownSeconds}s)` : 'Start Search'} <ArrowRight size={20} />
                        </button>
                     </div>
                  )}

                  {status === 'searching' && (
                     <div className="relative w-full space-y-12 animate-in fade-in zoom-in duration-700">
                        <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-full border-4 border-emerald-500/10 border-t-emerald-500 animate-spin mx-auto flex items-center justify-center">
                           <div className="text-5xl font-black italic animate-none">{elapsedSeconds}s</div>
                        </div>
                        <div className="space-y-6">
                           <h2 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter animate-pulse">Searching...</h2>
                           <div className="flex flex-col items-center gap-4">
                              <div className="px-5 py-2 bg-white/5 border border-white/10 rounded-full flex items-center gap-3">
                                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                 <span className="text-[10px] font-black uppercase tracking-widest">Radius: ±{currentRange} Elo</span>
                              </div>
                              <div className="flex gap-2 w-full max-w-xs">
                                 {searchSteps.map((step, i) => (
                                   <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-1000 ${currentRange >= parseInt(step.range.replace(/\D/g,'')) || step.range === '±500' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-white/5'}`} />
                                 ))}
                              </div>
                           </div>
                        </div>
                        <button onClick={() => setStatus('idle')} className="px-10 py-5 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Cancel Search</button>
                     </div>
                  )}

                  {status === 'found' && (
                     <div className="relative w-full space-y-12 animate-in fade-in zoom-in duration-500">
                        <div className="flex items-center justify-center gap-6 md:gap-16">
                           <div className="flex flex-col items-center gap-6">
                              <div className="w-28 h-28 md:w-40 md:h-40 rounded-[3rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl relative">
                                 <span className="text-5xl font-black italic">{(profile?.username || 'S').charAt(0)}</span>
                                 {iHaveAccepted && <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-emerald-500" size={40} /></div>}
                              </div>
                              <div className="text-center"><div className="text-xl font-black italic uppercase">{profile?.username}</div><div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">You</div></div>
                           </div>
                           <div className="text-5xl md:text-8xl font-black italic text-zinc-800 select-none">VS</div>
                           <div className="flex flex-col items-center gap-6">
                              <div className="w-28 h-28 md:w-40 md:h-40 rounded-[3rem] bg-zinc-800 border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl relative">
                                 <UserIcon size={50} className="text-zinc-700" />
                                 {opponentAccepted && <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm"><CheckCircle2 className="text-emerald-500" size={40} /></div>}
                              </div>
                              <div className="text-center"><div className="text-xl font-black italic uppercase">{opponent?.username || 'Opponent'}</div><div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Searching...</div></div>
                           </div>
                        </div>
                        <div className="max-w-md mx-auto space-y-6">
                           <div className="flex items-center justify-center gap-3 text-emerald-500"><Zap size={20} className="animate-bounce" /><span className="text-2xl font-black italic uppercase tracking-widest">Match Found!</span></div>
                           <div className="text-sm font-black italic text-zinc-500 mb-2">Accept within {acceptCountdown}s</div>
                           <button 
                              onClick={() => setIHaveAccepted(true)}
                              disabled={iHaveAccepted}
                              className={`w-full py-7 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-2xl transition-all ${iHaveAccepted ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-emerald-500 text-black hover:scale-[1.02]'}`}
                           >
                              {iHaveAccepted ? 'Waiting for Opponent...' : 'Accept Match'}
                           </button>
                        </div>
                     </div>
                  )}
               </div>

               {/* Live Matches & Guidelines */}
               <div className="grid md:grid-cols-2 gap-8">
                  <div className="p-10 rounded-[3.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl">
                     <div className="flex items-center justify-between mb-10">
                        <div className="flex items-center gap-4"><Activity className="w-6 h-6 text-purple-500" /><h3 className="text-lg font-black uppercase tracking-tighter italic">Live Matches</h3></div>
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                     </div>
                     <div className="space-y-4">
                        {liveMatches.length > 0 ? liveMatches.map((m, i) => (
                          <div key={i} className="p-5 rounded-[1.5rem] bg-white/[0.02] border border-white/5 flex items-center justify-between group hover:bg-white/[0.05] transition-all">
                             <div className="flex flex-col"><span className="text-[10px] font-black italic uppercase">{m.player1_username} vs {m.player2_username}</span><span className={`text-[8px] font-black uppercase tracking-widest ${m.app === 'scolia' ? 'text-emerald-500' : 'text-cyan-500'}`}>{m.app}</span></div>
                             <ChevronRight size={14} className="text-zinc-800 group-hover:text-white transition-colors" />
                          </div>
                        )) : (
                          <div className="text-center py-10 text-[10px] font-black uppercase tracking-widest text-zinc-700 italic">No matches in progress...</div>
                        )}
                     </div>
                  </div>

                  <div className="p-10 rounded-[3.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl">
                     <div className="flex items-center gap-4 mb-8">
                        <ShieldCheck className="w-6 h-6 text-emerald-500" />
                        <h3 className="text-lg font-black uppercase tracking-tighter italic">Elite Rules</h3>
                     </div>
                     <div className="space-y-6">
                        {[
                          { title: 'Kamerapflicht', desc: 'Scolia & DartCounter' },
                          { title: 'Fair Play', desc: 'Double Confirmation' },
                          { title: 'No-Show Ban', desc: 'Automatic Suspension' }
                        ].map((rule, i) => (
                          <div key={i} className="flex gap-5">
                             <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-emerald-500"><CheckCircle2 size={18} /></div>
                             <div><div className="text-[11px] font-black uppercase tracking-widest text-white">{rule.title}</div><div className="text-xs text-zinc-600 font-medium">{rule.desc}</div></div>
                          </div>
                        ))}
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
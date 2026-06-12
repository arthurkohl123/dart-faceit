'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Trophy, Star, Shield, Crown, Activity, Target, 
  Settings, CheckCircle2, AlertCircle, Phone, 
  ChevronRight, Swords, TrendingUp, 
  Sparkles, Zap, Award, BarChart3, Clock, 
  User as UserIcon, Camera, LayoutDashboard,
  Save, X, ExternalLink, ShieldCheck, Flame, 
  History, Medal, Globe, ArrowUpRight, LogOut
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- KONSISTENTE RANK ICONS (CINEMATIC DESIGN) ---
const RankIcon = ({ type, size = "w-24 h-24" }: { type: string, size?: string }) => {
  const baseClass = `${size} relative flex items-center justify-center rounded-[2.5rem] border-2 transition-all duration-700 group-hover:scale-110 group-hover:rotate-3 overflow-hidden`;
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-900 border-zinc-700 text-zinc-500 shadow-[0_0_30px_rgba(39,39,42,0.3)]',
    'Bronze': 'bg-gradient-to-br from-orange-900/40 to-black border-orange-800/50 text-orange-400 shadow-[0_0_30px_rgba(124,45,18,0.3)]',
    'Silber': 'bg-gradient-to-br from-slate-700/40 to-black border-slate-600/50 text-slate-200 shadow-[0_0_30px_rgba(71,85,105,0.3)]',
    'Gold': 'bg-gradient-to-br from-yellow-700/40 to-black border-yellow-600/50 text-yellow-300 shadow-[0_0_30px_rgba(161,98,7,0.3)]',
    'Platin': 'bg-gradient-to-br from-cyan-800/40 to-black border-cyan-700/50 text-cyan-300 shadow-[0_0_30px_rgba(21,94,117,0.3)]',
    'Diamant': 'bg-gradient-to-br from-blue-800/40 to-black border-blue-700/50 text-blue-300 shadow-[0_0_30px_rgba(30,64,175,0.3)]',
    'Legende': 'bg-gradient-to-br from-emerald-700/40 to-black border-emerald-600/50 text-white shadow-[0_0_30px_rgba(6,95,70,0.3)]',
  };
  return (
    <div className={`${baseClass} ${styles[type] || styles['Eisen']}`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-50" />
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2 relative z-10 drop-shadow-2xl" /> : <Shield className="w-1/2 h-1/2 relative z-10 drop-shadow-2xl" />}
      <div className="absolute -inset-full bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-45 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
    </div>
  );
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400', glow: 'from-zinc-500/20', accent: 'emerald' },
  { name: 'Bronze',  min: 1000, color: 'text-orange-400', glow: 'from-orange-500/20', accent: 'orange' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300', glow: 'from-slate-300/20', accent: 'slate' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-400', glow: 'from-yellow-400/20', accent: 'yellow' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-400', glow: 'from-cyan-400/20', accent: 'cyan' },
  { name: 'Diamant', min: 2000, color: 'text-blue-400', glow: 'from-blue-500/20', accent: 'blue' },
  { name: 'Legende', min: 2500, color: 'text-emerald-400', glow: 'from-emerald-400/20', accent: 'emerald' },
];

function getRank(elo: number) {
  return rankTiers.reduce((cur, r) => (elo >= r.min ? r : cur), rankTiers[0]);
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [editingPlatforms, setEditingPlatforms] = useState(false);
  const [scoliaInput, setScoliaInput] = useState('');
  const [dartcounterInput, setDartcounterInput] = useState('');
  const [platformSaveMsg, setPlatformSaveMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const fetchProfileData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/auth/login'); return; }
    const { data: profileData } = await supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single();
    if (profileData) {
      setProfile(profileData);
      setScoliaInput(profileData.scolia_username || '');
      setDartcounterInput(profileData.dartcounter_username || '');
      const { data: matchData } = await supabase.from('active_matches').select('*').or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`).eq('status', 'completed').order('created_at', { ascending: false }).limit(5);
      if (matchData) setMatches(matchData);
    }
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    fetchProfileData();
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchProfileData]);

  const handleSavePlatforms = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { error } = await supabase.from('profiles').update({ scolia_username: scoliaInput, dartcounter_username: dartcounterInput }).eq('supabaseId', session.user.id);
      if (error) throw error;
      setPlatformSaveMsg({ text: 'Updated!', type: 'success' });
      setEditingPlatforms(false);
      fetchProfileData();
    } catch (err) { setPlatformSaveMsg({ text: 'Error.', type: 'error' }); }
    setTimeout(() => setPlatformSaveMsg(null), 3000);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020304] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin shadow-[0_0_20px_rgba(16,185,129,0.2)]" />
      </main>
    );
  }

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);
  const nextRank = rankTiers[rankTiers.indexOf(currentRank) + 1] || currentRank;
  const progress = nextRank !== currentRank ? ((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100 : 100;
  const winrate = profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-32">
      {/* Cinematic Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[80%] h-[80%] blur-[160px] rounded-full opacity-30 bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] blur-[160px] rounded-full opacity-10 bg-cyan-500/20" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.04]" />
      </div>

      {/* Floating Island Navigation */}
      <div className="fixed top-8 left-0 right-0 z-50 px-6">
        <nav className={`max-w-5xl mx-auto transition-all duration-700 rounded-[2rem] border ${scrolled ? 'bg-black/80 backdrop-blur-2xl py-3 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]' : 'bg-white/5 backdrop-blur-md py-5 border-white/5'}`}>
          <div className="px-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-4 group">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all group-hover:scale-110">R</div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-lg font-black tracking-tighter uppercase">RankedDarts</span>
                <span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Elite Interface</span>
              </div>
            </Link>
            
            <div className="flex items-center gap-2 md:gap-8">
               <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
                  <Link href="/matchmaking" className="hover:text-white transition-colors">Matchmaking</Link>
                  <Link href="/premium" className="text-emerald-500 hover:text-emerald-400 flex items-center gap-2"><Star size={12} fill="currentColor" /> Premium</Link>
               </div>
               <div className="h-8 w-px bg-white/10 hidden md:block" />
               <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end hidden sm:flex">
                     <span className="text-[10px] font-black uppercase tracking-widest">{profile?.username}</span>
                     <span className={`text-[8px] font-bold uppercase tracking-widest ${currentRank.color}`}>{elo} Elo</span>
                  </div>
                  <button onClick={() => router.push('/settings')} className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all group">
                    <Settings className="w-5 h-5 text-zinc-500 group-hover:rotate-90 transition-transform duration-500" />
                  </button>
               </div>
            </div>
          </div>
        </nav>
      </div>

      <section className="relative z-10 pt-48 md:pt-60 px-6">
        <div className="max-w-6xl mx-auto">
          
          {/* Header Section */}
          <div className="relative mb-12 p-1 md:p-1.5 rounded-[3.5rem] bg-gradient-to-br from-white/10 to-transparent">
             <div className="relative p-8 md:p-16 rounded-[3.4rem] bg-[#050607] overflow-hidden group">
                <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity"><UserIcon size={300} /></div>
                <div className="relative flex flex-col lg:flex-row items-center gap-12 md:gap-20">
                   <div className="relative">
                      <div className={`absolute -inset-8 blur-[60px] opacity-40 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent animate-pulse`} />
                      <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-[3rem] bg-gradient-to-br from-zinc-800 to-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                        <span className="text-7xl md:text-9xl font-black text-white/5 italic">{(profile?.username || 'S').charAt(0).toUpperCase()}</span>
                        {profile?.isPremium && (
                          <div className="absolute top-6 right-6 bg-yellow-400 p-2.5 rounded-2xl shadow-[0_0_30px_rgba(250,204,21,0.4)] animate-bounce">
                            <Sparkles className="w-6 h-6 text-black fill-current" />
                          </div>
                        )}
                      </div>
                      <div className="absolute -bottom-8 -right-8"><RankIcon type={currentRank.name} /></div>
                   </div>
                   
                   <div className="flex-1 text-center lg:text-left space-y-8">
                      <div className="space-y-3">
                         <div className="flex flex-wrap justify-center lg:justify-start items-center gap-6">
                            <h1 className="text-6xl md:text-8xl font-black tracking-tighter italic uppercase leading-none text-white drop-shadow-2xl">{profile?.username}</h1>
                            {profile?.is_admin && <span className="px-5 py-2 bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-black uppercase tracking-[0.2em] rounded-full shadow-[0_0_20px_rgba(239,68,68,0.1)]">Elite Admin</span>}
                         </div>
                         <div className="flex items-center justify-center lg:justify-start gap-4">
                            <div className={`h-1.5 w-12 rounded-full bg-gradient-to-r from-${currentRank.accent}-500 to-transparent`} />
                            <p className={`text-sm md:text-lg font-black uppercase tracking-[0.5em] ${currentRank.color}`}>{currentRank.name} Division</p>
                         </div>
                      </div>
                      <div className="grid grid-cols-3 gap-6 md:gap-12 max-w-2xl">
                         <div className="space-y-2"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Rating</div><div className="text-4xl md:text-5xl font-black italic text-white">{elo}</div></div>
                         <div className="space-y-2"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Matches</div><div className="text-4xl md:text-5xl font-black italic text-white">{profile?.gamesPlayed || 0}</div></div>
                         <div className="space-y-2"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">Winrate</div><div className="text-4xl md:text-5xl font-black italic text-emerald-500">{winrate}%</div></div>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* Bento Dashboard */}
          <div className="grid lg:grid-cols-3 gap-8">
             
             {/* Progression Bento */}
             <div className="lg:col-span-2 p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 text-white/[0.02] -rotate-12 group-hover:scale-110 transition-transform"><TrendingUp size={200} /></div>
                <div className="flex items-center justify-between mb-12">
                   <div className="flex items-center gap-5"><div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]"><Activity size={24} /></div><h2 className="text-xl font-black uppercase tracking-tighter italic">Skill Progression</h2></div>
                   <div className="px-5 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-500">Season 01</div>
                </div>
                <div className="space-y-10">
                   <div className="flex justify-between items-end">
                      <div className="space-y-2"><div className={`text-[11px] font-black uppercase tracking-[0.3em] ${currentRank.color}`}>{currentRank.name}</div><div className="text-5xl font-black italic text-white">{elo} <span className="text-sm text-zinc-700 not-italic uppercase tracking-widest">Points</span></div></div>
                      <div className="text-right space-y-2"><div className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-600">Next Tier: {nextRank.name}</div><div className="text-3xl font-black italic text-zinc-800">{nextRank.min}</div></div>
                   </div>
                   <div className="relative h-8 bg-white/5 rounded-[1.2rem] p-1.5 border border-white/5 overflow-hidden">
                      <div className="absolute inset-y-1.5 left-1.5 rounded-[0.8rem] bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 transition-all duration-[1.5s] shadow-[0_0_30px_rgba(16,185,129,0.3)]" style={{ width: `calc(${progress}% - 12px)` }}>
                         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20" />
                         <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/10" />
                      </div>
                   </div>
                   <div className="flex items-center justify-center gap-3 text-[11px] font-black text-zinc-500 uppercase tracking-[0.4em]">
                      <span>Level {Math.floor(elo / 100)}</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                      <span>{nextRank.min - elo} Elo needed</span>
                   </div>
                </div>
             </div>

             {/* Quick Stats Grid */}
             <div className="grid grid-cols-2 gap-6">
                {[
                   { label: 'Wins', val: profile?.wins || 0, icon: Trophy, color: 'text-emerald-500', bg: 'bg-emerald-500/5' },
                   { label: 'Losses', val: (profile?.gamesPlayed || 0) - (profile?.wins || 0), icon: Target, color: 'text-red-500', bg: 'bg-red-500/5' },
                   { label: '180s', val: '--', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/5' },
                   { label: 'Streak', val: '--', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/5' }
                ].map((s, i) => (
                   <div key={i} className={`p-8 rounded-[2.5rem] ${s.bg} border border-white/5 flex flex-col items-center justify-center text-center gap-4 group hover:scale-[1.02] transition-all`}>
                      <div className={`w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center ${s.color} group-hover:scale-110 transition-transform`}><s.icon size={28} /></div>
                      <div className="space-y-1"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{s.label}</div><div className="text-3xl font-black italic text-white">{s.val}</div></div>
                   </div>
                ))}
             </div>

             {/* Platform Connections Bento */}
             <div className="lg:col-span-2 p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-12">
                   <div className="flex items-center gap-5"><div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)]"><Globe size={24} /></div><h2 className="text-xl font-black uppercase tracking-tighter italic">Platform Sync</h2></div>
                   <button onClick={() => setEditingPlatforms(!editingPlatforms)} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${editingPlatforms ? 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-white'}`}>
                      {editingPlatforms ? 'Save Configuration' : 'Edit Profiles'}
                   </button>
                </div>
                <div className="grid md:grid-cols-2 gap-8">
                   {[
                      { label: 'Scolia', icon: Camera, val: scoliaInput, set: setScoliaInput, color: 'text-emerald-500', desc: 'Hardware Tracking' },
                      { label: 'DartCounter', icon: LayoutDashboard, val: dartcounterInput, set: setDartcounterInput, color: 'text-cyan-500', desc: 'App Integration' }
                   ].map((p, i) => (
                      <div key={i} className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-all relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-[0.03] group-hover:scale-110 transition-transform"><p.icon size={100} /></div>
                        <div className="flex items-center gap-6 mb-6">
                           <div className={`w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center ${p.color} shadow-inner`}><p.icon size={28} /></div>
                           <div><div className="text-[11px] font-black uppercase tracking-widest text-zinc-200">{p.label}</div><div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{p.desc}</div></div>
                        </div>
                        {editingPlatforms ? (
                           <input type="text" value={p.val} onChange={(e) => p.set(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 outline-none text-lg font-black focus:border-emerald-500 transition-all" placeholder="Enter ID..." />
                        ) : (
                           <div className="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5"><div className="text-2xl font-black italic tracking-tight text-white">{p.val || 'Unlinked'}</div>{p.val && <ExternalLink size={16} className="text-zinc-700" />}</div>
                        )}
                      </div>
                   ))}
                </div>
                {editingPlatforms && <button onClick={handleSavePlatforms} className="w-full mt-10 py-6 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black rounded-2xl font-black uppercase tracking-widest transition-all hover:scale-[1.01] shadow-xl">Apply Global Sync</button>}
             </div>

             {/* Activity & Security Bento Column */}
             <div className="space-y-8">
                {/* Security Status */}
                <div className="p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl relative overflow-hidden group">
                   <div className="flex items-center gap-5 mb-10"><div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"><ShieldCheck size={24} /></div><h2 className="text-xl font-black uppercase tracking-tighter italic">Security</h2></div>
                   <div className="space-y-6">
                      <div className="flex items-center gap-6 p-6 rounded-[2rem] bg-white/5 border border-white/5 group-hover:bg-white/[0.08] transition-all">
                         <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${profile?.phone_verified ? 'bg-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'bg-red-500/20 text-red-500'}`}><Phone size={28} /></div>
                         <div><div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Verification</div><div className="text-lg font-black italic">{profile?.phone_verified ? 'SECURED' : 'PENDING'}</div></div>
                      </div>
                      {!profile?.phone_verified && <button className="w-full py-5 bg-emerald-500 text-black rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all hover:scale-[1.02] shadow-xl">Start Verification</button>}
                   </div>
                </div>

                {/* Match History Mini */}
                <div className="p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-xl group">
                   <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-5"><div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500"><History size={24} /></div><h2 className="text-xl font-black uppercase tracking-tighter italic">History</h2></div>
                      <ArrowUpRight size={20} className="text-zinc-700 group-hover:text-white transition-colors" />
                   </div>
                   <div className="space-y-4">
                      {matches.length > 0 ? matches.map((m, i) => {
                         const isWin = (m.winner_id === profile.supabaseId);
                         return (
                            <div key={i} className="flex items-center justify-between p-5 rounded-[1.5rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.08] transition-all group/match cursor-pointer">
                               <div className="flex items-center gap-5">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic text-xs ${isWin ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>{isWin ? 'W' : 'L'}</div>
                                  <div><div className="text-sm font-black italic">#{m.id.toString().slice(-4)}</div><div className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">{new Date(m.created_at).toLocaleDateString()}</div></div>
                               </div>
                               <div className={`text-xs font-black italic ${isWin ? 'text-emerald-500' : 'text-red-500'}`}>{isWin ? '+ELO' : '-ELO'}</div>
                            </div>
                         );
                      }) : (
                         <div className="text-center py-10 text-[10px] font-black uppercase tracking-widest text-zinc-700 italic">Initiate first match...</div>
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
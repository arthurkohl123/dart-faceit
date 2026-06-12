'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Trophy, Star, Shield, Crown, Activity, Target, 
  Settings, CheckCircle2, AlertCircle, Phone, 
  Swords, TrendingUp, Sparkles, Zap, Clock, 
  User as UserIcon, Camera, LayoutDashboard,
  Save, X, ExternalLink, ShieldCheck, History, ArrowUpRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- PERFORMANCE OPTIMIZED RANK ICONS ---
const RankIcon = ({ type, size = "w-20 h-20" }: { type: string, size?: string }) => {
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-900 border-zinc-700 text-zinc-500',
    'Bronze': 'bg-orange-950 border-orange-900 text-orange-400',
    'Silber': 'bg-slate-800 border-slate-700 text-slate-200',
    'Gold': 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
    'Platin': 'bg-cyan-900/40 border-cyan-700 text-cyan-300',
    'Diamant': 'bg-blue-900/40 border-blue-700 text-blue-300',
    'Legende': 'bg-emerald-900/40 border-emerald-700 text-white',
  };
  return (
    <div className={`${size} flex items-center justify-center rounded-[2rem] border-2 shadow-xl transition-transform duration-500 group-hover:scale-110 ${styles[type] || styles['Eisen']}`}>
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlatforms, setEditingPlatforms] = useState(false);
  const [scoliaInput, setScoliaInput] = useState('');
  const [dartcounterInput, setDartcounterInput] = useState('');
  
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // --- PARALLEL DATA FETCHING (SPEED BOOST) ---
  const fetchData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/auth/login'); return; }

    const [profileRes, matchRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('supabaseId', session.user.id).single(),
      supabase.from('active_matches').select('*').or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`).eq('status', 'completed').order('created_at', { ascending: false }).limit(5)
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      setScoliaInput(profileRes.data.scolia_username || '');
      setDartcounterInput(profileRes.data.dartcounter_username || '');
    }
    if (matchRes.data) setMatches(matchRes.data);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020304] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </main>
    );
  }

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);
  const nextRank = rankTiers[rankTiers.indexOf(currentRank) + 1] || currentRank;
  const progress = nextRank !== currentRank ? ((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100 : 100;

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans pb-20 overflow-x-hidden">
      {/* Optimized Background (Lightweight) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[60%] h-[60%] blur-[120px] rounded-full opacity-10 bg-gradient-to-br ${currentRank.glow} to-transparent`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02]" />
      </div>

      {/* Floating Navbar */}
      <div className="fixed top-6 left-0 right-0 z-50 px-4 md:px-6">
        <nav className="max-w-4xl mx-auto bg-black/60 backdrop-blur-xl rounded-2xl border border-white/5 py-4 px-6 flex items-center justify-between shadow-2xl">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-black font-black text-lg">R</div>
            <span className="text-sm font-black tracking-tighter uppercase hidden sm:block">RankedDarts</span>
          </Link>
          <div className="flex items-center gap-6">
             <Link href="/matchmaking" className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">Play</Link>
             <Link href="/leaderboard" className="text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">Ranks</Link>
             <div className="w-px h-4 bg-white/10" />
             <Link href="/profile" className="flex items-center gap-3 group">
                <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">{profile?.username}</span>
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-black italic text-xs group-hover:border-emerald-500 transition-all">
                   {profile?.username?.charAt(0)}
                </div>
             </Link>
          </div>
        </nav>
      </div>

      <section className="relative z-10 pt-32 md:pt-40 px-4 md:px-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {/* Header Bento */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-8 md:p-12 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md flex flex-col md:flex-row items-center gap-8 md:gap-12 relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-8 opacity-[0.02] pointer-events-none"><UserIcon size={200} /></div>
               <div className="relative">
                  <div className={`absolute -inset-4 blur-2xl opacity-20 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent`} />
                  <RankIcon type={currentRank.name} size="w-28 h-28 md:w-36 md:h-36" />
                  {profile?.isPremium && <div className="absolute top-2 right-2 bg-yellow-400 p-1.5 rounded-lg shadow-xl"><Sparkles size={16} className="text-black fill-current" /></div>}
               </div>
               <div className="text-center md:text-left space-y-6 flex-1">
                  <div className="space-y-1">
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic uppercase leading-none">{profile?.username}</h1>
                    <p className={`text-[10px] font-black uppercase tracking-[0.4em] ${currentRank.color}`}>{currentRank.name} Division</p>
                  </div>
                  <div className="flex flex-wrap justify-center md:justify-start gap-8">
                    <div><div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Elo</div><div className="text-2xl font-black italic">{elo}</div></div>
                    <div><div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Matches</div><div className="text-2xl font-black italic">{profile?.gamesPlayed || 0}</div></div>
                    <div><div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest mb-1">Winrate</div><div className="text-2xl font-black italic text-emerald-500">{profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0}%</div></div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               {[
                  { label: 'Wins', val: profile?.wins || 0, icon: Trophy, color: 'text-emerald-500' },
                  { label: 'Streak', val: '--', icon: Zap, color: 'text-yellow-500' },
                  { label: 'Global', val: '#--', icon: Globe, color: 'text-cyan-500' },
                  { label: 'Awards', val: '0', icon: Medal, color: 'text-purple-500' }
               ].map((s, i) => (
                  <div key={i} className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center gap-3">
                     <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${s.color}`}><s.icon size={20} /></div>
                     <div className="space-y-0.5"><div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">{s.label}</div><div className="text-xl font-black italic">{s.val}</div></div>
                  </div>
               ))}
            </div>
          </div>

          {/* Progress & Connections */}
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3"><TrendingUp size={18} className="text-emerald-500" /><h2 className="text-xs font-black uppercase tracking-widest">Progression</h2></div>
                     <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Season 1</span>
                  </div>
                  <div className="space-y-6">
                     <div className="flex justify-between items-end">
                        <div className="text-2xl font-black italic">{elo} <span className="text-[10px] text-zinc-700 not-italic uppercase tracking-widest">Elo</span></div>
                        <div className="text-right text-xs font-black italic text-zinc-800">Next: {nextRank.min}</div>
                     </div>
                     <div className="h-4 bg-white/5 rounded-full p-1 border border-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" style={{ width: `${progress}%` }} />
                     </div>
                  </div>
               </div>

               <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3"><Zap size={18} className="text-cyan-500" /><h2 className="text-xs font-black uppercase tracking-widest">Platforms</h2></div>
                     <button onClick={() => setEditingPlatforms(!editingPlatforms)} className="text-[9px] font-black uppercase tracking-widest text-emerald-500 hover:underline">{editingPlatforms ? 'Save' : 'Edit'}</button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                     {[
                        { label: 'Scolia', icon: Camera, val: scoliaInput, set: setScoliaInput, color: 'text-emerald-500' },
                        { label: 'DartCounter', icon: LayoutDashboard, val: dartcounterInput, set: setDartcounterInput, color: 'text-cyan-500' }
                     ].map((p, i) => (
                        <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${p.color}`}><p.icon size={20} /></div>
                           <div className="flex-1 min-w-0">
                              <div className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">{p.label}</div>
                              {editingPlatforms ? (
                                 <input type="text" value={p.val} onChange={(e) => p.set(e.target.value)} className="w-full bg-transparent border-b border-white/10 outline-none text-sm font-bold py-1 focus:border-emerald-500" />
                              ) : (
                                 <div className="text-sm font-black italic truncate">{p.val || 'Unlinked'}</div>
                              )}
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            </div>

            <div className="space-y-6">
               <div className="p-8 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-8"><History size={18} className="text-purple-500" /><h2 className="text-xs font-black uppercase tracking-widest">Activity</h2></div>
                  <div className="space-y-3">
                     {matches.map((m, i) => {
                        const isWin = (m.winner_id === profile.supabaseId);
                        return (
                           <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                              <div className="flex items-center gap-3">
                                 <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${isWin ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{isWin ? 'W' : 'L'}</div>
                                 <div className="text-[10px] font-black italic">#{m.id.toString().slice(-4)}</div>
                              </div>
                              <div className="text-[8px] font-black text-zinc-700 uppercase">{new Date(m.created_at).toLocaleDateString()}</div>
                           </div>
                        );
                     })}
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
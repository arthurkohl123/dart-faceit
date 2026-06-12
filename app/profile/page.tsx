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
  History, Medal, Globe, ArrowUpRight
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- KONSISTENTE RANK ICONS (PREMIUM DESIGN) ---
const RankIcon = ({ type, size = "w-20 h-20" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-[2rem] border-2 shadow-2xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6`;
  const styles: Record<string, string> = {
    'Eisen': 'bg-zinc-900 border-zinc-700 text-zinc-500 shadow-zinc-900/50',
    'Bronze': 'bg-gradient-to-br from-orange-900/60 to-black border-orange-800 text-orange-400 shadow-orange-900/40',
    'Silber': 'bg-gradient-to-br from-slate-700/60 to-black border-slate-600 text-slate-200 shadow-slate-900/40',
    'Gold': 'bg-gradient-to-br from-yellow-700/60 to-black border-yellow-600 text-yellow-300 shadow-yellow-900/40',
    'Platin': 'bg-gradient-to-br from-cyan-800/60 to-black border-cyan-700 text-cyan-300 shadow-cyan-900/40',
    'Diamant': 'bg-gradient-to-br from-blue-800/60 to-black border-blue-700 text-blue-300 shadow-blue-900/40',
    'Legende': 'bg-gradient-to-br from-emerald-700/60 to-black border-emerald-600 text-white shadow-emerald-900/40',
  };
  return (
    <div className={`${baseClass} ${styles[type] || styles['Eisen']}`}>
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2 drop-shadow-lg" /> : <Shield className="w-1/2 h-1/2 drop-shadow-lg" />}
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
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('supabaseId', session.user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
      setScoliaInput(profileData.scolia_username || '');
      setDartcounterInput(profileData.dartcounter_username || '');

      const { data: matchData } = await supabase
        .from('active_matches')
        .select('*')
        .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(5);
      
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
      setPlatformSaveMsg({ text: 'Gespeichert!', type: 'success' });
      setEditingPlatforms(false);
      fetchProfileData();
    } catch (err) {
      setPlatformSaveMsg({ text: 'Fehler.', type: 'error' });
    }
    setTimeout(() => setPlatformSaveMsg(null), 3000);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020304] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </main>
    );
  }

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);
  const nextRank = rankTiers[rankTiers.indexOf(currentRank) + 1] || currentRank;
  const progress = nextRank !== currentRank ? ((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100 : 100;
  const winrate = profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden pb-20">
      {/* Immersive Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-20%] left-[-10%] w-[70%] h-[70%] blur-[160px] rounded-full opacity-20 bg-gradient-to-br ${currentRank.glow} to-transparent`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-2xl py-4 border-b border-white/5' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-8 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Profile Dashboard</span>
            </div>
          </Link>
          <div className="flex items-center gap-4">
             <Link href="/matchmaking" className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-emerald-500 hover:text-black transition-all group"><Swords className="w-5 h-5" /></Link>
             <button onClick={() => router.push('/settings')} className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"><Settings className="w-5 h-5 text-zinc-400" /></button>
          </div>
        </div>
      </nav>

      <section className="relative z-10 pt-32 md:pt-48 px-6">
        <div className="max-w-6xl mx-auto">
          
          {/* Bento Header */}
          <div className="grid lg:grid-cols-3 gap-8 mb-8">
            {/* Main Identity Card */}
            <div className="lg:col-span-2 relative p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-3xl overflow-hidden group">
               <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity"><UserIcon size={200} /></div>
               <div className="relative flex flex-col md:flex-row items-center gap-10">
                  <div className="relative">
                    <div className={`absolute -inset-4 blur-3xl opacity-30 rounded-full bg-gradient-to-br ${currentRank.glow} to-transparent`} />
                    <div className="relative w-32 h-32 md:w-44 md:h-44 rounded-[2.5rem] bg-gradient-to-br from-zinc-800 to-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                      <span className="text-6xl md:text-8xl font-black text-white/5 italic">{(profile?.username || 'S').charAt(0).toUpperCase()}</span>
                      {profile?.isPremium && <div className="absolute top-4 right-4 bg-yellow-400 p-2 rounded-xl shadow-2xl animate-pulse"><Sparkles className="w-5 h-5 text-black fill-current" /></div>}
                    </div>
                    <div className="absolute -bottom-6 -right-6"><RankIcon type={currentRank.name} /></div>
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-6">
                    <div className="space-y-2">
                      <div className="flex flex-wrap justify-center md:justify-start items-center gap-4">
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic uppercase leading-none">{profile?.username}</h1>
                        {profile?.is_admin && <span className="px-4 py-1.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-full">Pro Admin</span>}
                      </div>
                      <p className={`text-sm font-black uppercase tracking-[0.4em] ${currentRank.color}`}>{currentRank.name} Division</p>
                    </div>
                    <div className="flex flex-wrap justify-center md:justify-start gap-8">
                      <div className="space-y-1"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Rating</div><div className="text-3xl font-black italic text-white">{elo}</div></div>
                      <div className="space-y-1"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Matches</div><div className="text-3xl font-black italic text-white">{profile?.gamesPlayed || 0}</div></div>
                      <div className="space-y-1"><div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Winrate</div><div className="text-3xl font-black italic text-emerald-500">{winrate}%</div></div>
                    </div>
                  </div>
               </div>
            </div>

            {/* Quick Stats Bento */}
            <div className="grid grid-cols-2 gap-4">
               <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center gap-4 group hover:bg-emerald-500/5 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform"><Trophy size={24} /></div>
                  <div className="space-y-1"><div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Wins</div><div className="text-2xl font-black italic">{profile?.wins || 0}</div></div>
               </div>
               <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center gap-4 group hover:bg-cyan-500/5 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform"><Target size={24} /></div>
                  <div className="space-y-1"><div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Avg</div><div className="text-2xl font-black italic">--</div></div>
               </div>
               <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center gap-4 group hover:bg-purple-500/5 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform"><Flame size={24} /></div>
                  <div className="space-y-1"><div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Streak</div><div className="text-2xl font-black italic">--</div></div>
               </div>
               <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center gap-4 group hover:bg-amber-500/5 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><Medal size={24} /></div>
                  <div className="space-y-1"><div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Rank</div><div className="text-2xl font-black italic">#--</div></div>
               </div>
            </div>
          </div>

          {/* Secondary Grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column: Progress & Platforms */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Progress Bento */}
              <div className="p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md relative overflow-hidden">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4"><TrendingUp className="w-6 h-6 text-emerald-500" /><h2 className="text-lg font-black uppercase tracking-tighter italic">Division Progress</h2></div>
                  <div className="px-4 py-1.5 bg-white/5 rounded-full text-[9px] font-black uppercase tracking-widest text-zinc-500">Season 1</div>
                </div>
                <div className="space-y-8">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1"><div className={`text-[10px] font-black uppercase tracking-widest ${currentRank.color}`}>{currentRank.name}</div><div className="text-4xl font-black italic">{elo} <span className="text-xs text-zinc-700 not-italic uppercase">Points</span></div></div>
                    <div className="text-right space-y-1"><div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Next: {nextRank.name}</div><div className="text-2xl font-black italic text-zinc-800">{nextRank.min}</div></div>
                  </div>
                  <div className="relative h-6 bg-white/5 rounded-full p-1 border border-white/5">
                    <div className="absolute inset-y-1 left-1 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-1000 shadow-lg shadow-emerald-500/20" style={{ width: `calc(${progress}% - 8px)` }} />
                  </div>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] text-center">Noch <span className="text-white">{nextRank.min - elo} Elo</span> bis zum Aufstieg</p>
                </div>
              </div>

              {/* Connections Bento */}
              <div className="p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-4"><Globe className="w-6 h-6 text-cyan-500" /><h2 className="text-lg font-black uppercase tracking-tighter italic">Connected Accounts</h2></div>
                  <button onClick={() => setEditingPlatforms(!editingPlatforms)} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${editingPlatforms ? 'bg-emerald-500 text-black' : 'bg-white/5 border border-white/10 text-zinc-400'}`}>
                    {editingPlatforms ? 'Save Changes' : 'Manage'}
                  </button>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    { label: 'Scolia', icon: Camera, val: scoliaInput, set: setScoliaInput, color: 'text-emerald-500' },
                    { label: 'DartCounter', icon: LayoutDashboard, val: dartcounterInput, set: setDartcounterInput, color: 'text-cyan-500' }
                  ].map((p, i) => (
                    <div key={i} className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-all">
                      <div className="flex items-center gap-6 mb-4">
                        <div className={`w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center ${p.color}`}><p.icon size={24} /></div>
                        <div className="text-[11px] font-black uppercase tracking-widest text-zinc-600">{p.label}</div>
                      </div>
                      {editingPlatforms ? (
                        <input type="text" value={p.val} onChange={(e) => p.set(e.target.value)} className="w-full bg-transparent border-b border-white/10 outline-none text-lg font-black py-2 focus:border-emerald-500" placeholder="Username..." />
                      ) : (
                        <div className="flex items-center justify-between"><div className="text-xl font-black italic">{p.val || 'Not linked'}</div>{p.val && <ExternalLink size={14} className="text-zinc-700" />}</div>
                      )}
                    </div>
                  ))}
                </div>
                {editingPlatforms && <button onClick={handleSavePlatforms} className="w-full mt-8 py-5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-black uppercase tracking-widest transition-all">Confirm Update</button>}
              </div>
            </div>

            {/* Right Column: History & Security */}
            <div className="space-y-8">
              {/* Security Bento */}
              <div className="p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-4 mb-10"><ShieldCheck className="w-6 h-6 text-emerald-500" /><h2 className="text-lg font-black uppercase tracking-tighter italic">Security</h2></div>
                <div className="space-y-6">
                  <div className="flex items-center gap-6 p-6 rounded-2xl bg-white/5 border border-white/5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${profile?.phone_verified ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}><Phone size={24} /></div>
                    <div><div className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Verification</div><div className="font-black italic">{profile?.phone_verified ? 'SECURED' : 'PENDING'}</div></div>
                  </div>
                  {!profile?.phone_verified && <button className="w-full py-5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Verify Now</button>}
                </div>
              </div>

              {/* Recent Activity Bento */}
              <div className="p-10 rounded-[3rem] bg-zinc-900/30 border border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-4 mb-10"><History className="w-6 h-6 text-purple-500" /><h2 className="text-lg font-black uppercase tracking-tighter italic">Activity</h2></div>
                <div className="space-y-4">
                  {matches.length > 0 ? matches.map((m, i) => {
                    const isWin = (m.winner_id === profile.supabaseId);
                    return (
                      <div key={i} className="flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic text-xs ${isWin ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>{isWin ? 'W' : 'L'}</div>
                          <div><div className="text-sm font-black italic">#{m.id.toString().slice(-4)}</div><div className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">{new Date(m.created_at).toLocaleDateString()}</div></div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-zinc-800 group-hover:text-white transition-colors" />
                      </div>
                    );
                  }) : (
                    <div className="text-center py-10 text-[10px] font-black uppercase tracking-widest text-zinc-700 italic">No matches yet</div>
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
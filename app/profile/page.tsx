'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Trophy, Star, Shield, Crown, Activity, Target, 
  Settings, CheckCircle2, AlertCircle, Phone, 
  ChevronRight, Swords, TrendingUp, 
  Sparkles, Zap, Award, BarChart3, Clock, 
  User as UserIcon, Camera, LayoutDashboard,
  Save, X, ExternalLink, ShieldCheck
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

// --- KONSISTENTE RANK ICONS ---
const RankIcon = ({ type, size = "w-16 h-16" }: { type: string, size?: string }) => {
  const baseClass = `${size} flex items-center justify-center rounded-2xl border shadow-xl transition-all duration-500`;
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
    <div className={`${baseClass} ${styles[type] || styles['Eisen']}`}>
      {type === 'Legende' ? <Crown className="w-1/2 h-1/2" /> : <Shield className="w-1/2 h-1/2" />}
    </div>
  );
};

const rankTiers = [
  { name: 'Eisen',   min: 0,    color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  { name: 'Bronze',  min: 1000, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { name: 'Silber',  min: 1250, color: 'text-slate-300', bg: 'bg-slate-300/10' },
  { name: 'Gold',    min: 1500, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { name: 'Platin',  min: 1750, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
  { name: 'Diamant', min: 2000, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { name: 'Legende', min: 2500, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
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

    // Profil laden
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('supabaseId', session.user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
      setScoliaInput(profileData.scolia_username || '');
      setDartcounterInput(profileData.dartcounter_username || '');

      // Matches laden
      const { data: matchData } = await supabase
        .from('active_matches')
        .select('*')
        .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);
      
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

      const { error } = await supabase
        .from('profiles')
        .update({
          scolia_username: scoliaInput,
          dartcounter_username: dartcounterInput
        })
        .eq('supabaseId', session.user.id);

      if (error) throw error;
      
      setPlatformSaveMsg({ text: 'Erfolgreich gespeichert!', type: 'success' });
      setEditingPlatforms(false);
      fetchProfileData();
    } catch (err) {
      setPlatformSaveMsg({ text: 'Fehler beim Speichern.', type: 'error' });
    }
    setTimeout(() => setPlatformSaveMsg(null), 3000);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#020304] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </main>
    );
  }

  const elo = profile?.elo || 1000;
  const currentRank = getRank(elo);
  const nextRank = rankTiers[rankTiers.indexOf(currentRank) + 1] || currentRank;
  const progress = nextRank !== currentRank ? ((elo - currentRank.min) / (nextRank.min - currentRank.min)) * 100 : 100;
  const winrate = profile?.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className={`absolute top-[-10%] left-[-10%] w-[60%] h-[60%] blur-[150px] rounded-full opacity-20 ${currentRank.bg}`} />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02]" />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-xl py-4 border-b border-white/5' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Player Profile</span>
            </div>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/matchmaking" className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">
              <Swords className="w-4 h-4" /> Matchmaking
            </Link>
            <button onClick={() => router.push('/settings')} className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>
      </nav>

      <section className="relative z-10 pt-40 pb-32 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row items-center gap-10 mb-16 bg-zinc-900/20 border border-white/5 p-10 rounded-[3rem] backdrop-blur-md">
            <div className="relative group">
              <div className={`absolute -inset-4 blur-2xl opacity-20 rounded-full ${currentRank.bg}`} />
              <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] bg-gradient-to-br from-zinc-800 to-black border-2 border-white/10 flex items-center justify-center overflow-hidden shadow-2xl">
                <span className="text-5xl md:text-6xl font-black text-white/10 italic">{(profile?.username || 'S').charAt(0).toUpperCase()}</span>
                {profile?.isPremium && (
                  <div className="absolute top-4 right-4 bg-yellow-400 p-1.5 rounded-lg shadow-xl"><Sparkles className="w-4 h-4 text-black fill-current" /></div>
                )}
              </div>
              <div className="absolute -bottom-4 -right-4 shadow-2xl">
                <RankIcon type={currentRank.name} size="w-14 h-14 md:w-16 md:h-16" />
              </div>
            </div>

            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic uppercase">{profile?.username || 'Spieler'}</h1>
                {profile?.is_admin && <span className="px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded-lg">Admin</span>}
              </div>
              <div className="flex flex-wrap justify-center md:justify-start gap-6">
                <div className="flex items-center gap-2"><Trophy className="w-4 h-4 text-emerald-500" /><span className="text-xl font-black italic">{elo} <span className="text-[10px] text-zinc-500 uppercase not-italic ml-1">Elo</span></span></div>
                <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-500" /><span className="text-xl font-black italic">{profile?.gamesPlayed || 0} <span className="text-[10px] text-zinc-500 uppercase not-italic ml-1">Matches</span></span></div>
                <div className="flex items-center gap-2"><Target className="w-4 h-4 text-purple-500" /><span className="text-xl font-black italic">{winrate}% <span className="text-[10px] text-zinc-500 uppercase not-italic ml-1">Winrate</span></span></div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
              {/* Rank Progress */}
              <div className="bg-zinc-900/20 border border-white/5 p-8 rounded-[2.5rem] backdrop-blur-md">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4"><TrendingUp className="w-5 h-5 text-emerald-500" /><h2 className="text-sm font-black uppercase tracking-widest">Rank Progression</h2></div>
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div><div className={`text-[10px] font-black uppercase tracking-widest ${currentRank.color}`}>{currentRank.name}</div><div className="text-2xl font-black italic">{elo} Elo</div></div>
                    <div className="text-right"><div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Next: {nextRank.name}</div><div className="text-lg font-black italic text-zinc-700">{nextRank.min} Elo</div></div>
                  </div>
                  <div className="relative h-4 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-1000" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </div>

              {/* Platforms */}
              <div className="bg-zinc-900/20 border border-white/5 p-8 rounded-[2.5rem] backdrop-blur-md">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4"><Zap className="w-5 h-5 text-cyan-500" /><h2 className="text-sm font-black uppercase tracking-widest">Plattformen</h2></div>
                  {!editingPlatforms ? (
                    <button onClick={() => setEditingPlatforms(true)} className="text-[10px] font-black uppercase tracking-widest text-emerald-500 hover:underline">Bearbeiten</button>
                  ) : (
                    <div className="flex items-center gap-4">
                      <button onClick={handleSavePlatforms} className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1"><Save className="w-3 h-3" /> Save</button>
                      <button onClick={() => setEditingPlatforms(false)} className="text-[10px] font-black uppercase tracking-widest text-zinc-500"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {[
                    { id: 'scolia', label: 'Scolia', icon: Camera, val: scoliaInput, set: setScoliaInput, color: 'text-emerald-500' },
                    { id: 'dartcounter', label: 'DartCounter', icon: LayoutDashboard, val: dartcounterInput, set: setDartcounterInput, color: 'text-cyan-500' }
                  ].map((p, i) => (
                    <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-6">
                      <div className={`w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center ${p.color}`}><p.icon className="w-6 h-6" /></div>
                      <div className="flex-1">
                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{p.label} Username</div>
                        {editingPlatforms ? (
                          <input type="text" value={p.val} onChange={(e) => p.set(e.target.value)} className="w-full bg-transparent border-b border-white/10 outline-none text-sm font-bold py-1 focus:border-emerald-500" placeholder="Username eingeben..." />
                        ) : (
                          <div className="font-bold">{p.val || 'Nicht hinterlegt'}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {platformSaveMsg && <div className={`text-center text-[10px] font-black uppercase tracking-widest mt-4 ${platformSaveMsg.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>{platformSaveMsg.text}</div>}
                </div>
              </div>

              {/* Match History */}
              <div className="bg-zinc-900/20 border border-white/5 p-8 rounded-[2.5rem] backdrop-blur-md">
                <div className="flex items-center gap-4 mb-8"><Clock className="w-5 h-5 text-purple-500" /><h2 className="text-sm font-black uppercase tracking-widest">Match History</h2></div>
                <div className="space-y-4">
                  {matches.length > 0 ? matches.map((m, i) => {
                    const isWin = (m.winner_id === profile.supabaseId);
                    return (
                      <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between group hover:bg-white/[0.08] transition-all">
                        <div className="flex items-center gap-6">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic text-xs ${isWin ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{isWin ? 'W' : 'L'}</div>
                          <div>
                            <div className="text-sm font-bold">Match #{m.id.toString().slice(-4)}</div>
                            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Completed</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-black italic ${isWin ? 'text-emerald-500' : 'text-red-500'}`}>{isWin ? '+Elo' : '-Elo'}</div>
                          <div className="text-[8px] font-black uppercase tracking-widest text-zinc-700">{new Date(m.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center py-10 text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">No matches played yet</div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* Verification */}
              <div className="bg-zinc-900/20 border border-white/5 p-8 rounded-[2.5rem] backdrop-blur-md">
                <div className="flex items-center gap-4 mb-8"><ShieldCheck className="w-5 h-5 text-emerald-500" /><h2 className="text-sm font-black uppercase tracking-widest">Security</h2></div>
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${profile?.phone_verified ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}><Phone className="w-5 h-5" /></div>
                    <div><div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Status</div><div className="text-sm font-bold">{profile?.phone_verified ? 'Verifiziert' : 'Nicht verifiziert'}</div></div>
                  </div>
                  {!profile?.phone_verified && <button className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Jetzt verifizieren</button>}
                </div>
              </div>

              {/* Admin Panel */}
              {profile?.is_admin && (
                <Link href="/admin" className="block p-8 rounded-[2.5rem] bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-all">
                  <div className="flex items-center gap-4 mb-4"><LayoutDashboard className="w-5 h-5 text-red-500" /><h2 className="text-sm font-black uppercase tracking-widest text-red-500">Admin Area</h2></div>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Manage players and matches</p>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
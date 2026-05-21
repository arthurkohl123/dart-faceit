'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden relative">
      
      {/* Dezent aber erkennbarer Dart-Hintergrund */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#22c55e_0.8px,transparent_1px)] [background-size:50px_50px]"></div>
        <div className="absolute -left-20 top-1/3 text-[380px] text-green-500/10 rotate-[-28deg] select-none">➶</div>
        <div className="absolute -right-32 bottom-1/4 text-[420px] text-green-500/10 rotate-[22deg] select-none">➶</div>
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-lg border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-2xl font-black text-black">
              R
            </div>
            <h1 className="text-3xl font-black tracking-tighter">RANKEDDARTS</h1>
          </div>

          <div className="flex items-center gap-8 text-lg">
            <a href="/leaderboard" className="hover:text-green-400 transition">Leaderboard</a>
            <a href="/matchmaking" className="hover:text-green-400 transition">Matchmaking</a>
            <a href="/updates" className="hover:text-green-400 transition">Updates</a>
            
            <button 
              onClick={() => router.push('/auth/login')}
              className="px-8 py-3 bg-white text-black font-semibold rounded-2xl hover:bg-zinc-200 transition"
            >
              Login
            </button>
            <button 
              onClick={() => router.push('/auth/register')}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 font-semibold rounded-2xl transition"
            >
              Kostenlos Registrieren
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="pt-32 pb-28 relative">
        <div className="max-w-6xl mx-auto px-8 text-center relative">
          <div className="inline-flex items-center gap-2 bg-zinc-900 border border-green-500/30 rounded-full px-6 py-2.5 mb-8">
            <span className="text-green-500">● LIVE</span>
            <span className="text-sm font-medium">1.284 Dartspieler gerade online</span>
          </div>

          <h1 className="text-7xl md:text-8xl font-black tracking-tighter mb-6 leading-none">
            DAS FACEIT<br />
            <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              FÜR DARTS
            </span>
          </h1>

          <p className="text-2xl text-zinc-400 max-w-2xl mx-auto mb-12">
            Kompetitives Dart mit Elo-System, präzisem Matchmaking und monatlichen Preisgeldern.
          </p>

          <div className="flex justify-center gap-6">
            <button 
              onClick={() => router.push('/auth/register')}
              className="px-16 py-7 bg-gradient-to-r from-green-500 to-emerald-600 text-2xl font-bold rounded-3xl hover:scale-105 transition-all shadow-2xl shadow-green-500/50"
            >
              JETZT KOSTENLOS STARTEN
            </button>
            <button 
              onClick={() => router.push('/leaderboard')}
              className="px-12 py-7 border-2 border-zinc-700 hover:border-white text-xl rounded-3xl transition font-medium"
            >
              Leaderboard ansehen →
            </button>
          </div>
        </div>
      </div>

      {/* Trust Bar */}
      <div className="border-y border-zinc-800 py-6 relative z-10">
        <div className="max-w-6xl mx-auto px-8 flex flex-wrap justify-center gap-x-12 gap-y-4 text-sm text-zinc-400">
          <div>✅ Fairer Elo-Algorithmus</div>
          <div>✅ Präzises Matchmaking</div>
          <div>✅ Monatliche Preisgelder</div>
          <div>✅ Dart-spezifische Statistiken</div>
          <div>✅ Transparente Rangliste</div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-8 py-24 relative z-10">
        <h2 className="text-5xl font-bold text-center mb-16">Warum RankedDarts?</h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-zinc-900/70 border border-zinc-700 rounded-3xl p-10 hover:border-green-500/50 transition-all group">
            <div className="text-6xl mb-8">🏆</div>
            <h3 className="text-3xl font-bold mb-4">Elo & Rangsystem</h3>
            <p className="text-zinc-400 leading-relaxed">Von Eisen bis Legende. Zeig der Dart-Community, auf welchem Level du spielst.</p>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-700 rounded-3xl p-10 hover:border-green-500/50 transition-all group">
            <div className="text-6xl mb-8">🎯</div>
            <h3 className="text-3xl font-bold mb-4">Smart Matchmaking</h3>
            <p className="text-zinc-400 leading-relaxed">Immer Gegner auf ähnlichem Niveau. Keine unfairen Matches mehr.</p>
          </div>

          <div className="bg-zinc-900/70 border border-zinc-700 rounded-3xl p-10 hover:border-green-500/50 transition-all group">
            <div className="text-6xl mb-8">💰</div>
            <h3 className="text-3xl font-bold mb-4">Monatliche Preisgelder</h3>
            <p className="text-zinc-400 leading-relaxed">Top 3 des Leaderboards gewinnen echtes Geld.</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-black py-20 border-t border-zinc-800 relative z-10">
        <div className="max-w-6xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          <div>
            <div className="text-7xl font-black text-green-500">1.284</div>
            <div className="text-zinc-400 mt-3">Aktive Spieler</div>
          </div>
          <div>
            <div className="text-7xl font-black text-green-500">52.391</div>
            <div className="text-zinc-400 mt-3">Matches gespielt</div>
          </div>
          <div>
            <div className="text-7xl font-black text-green-500">€3.250</div>
            <div className="text-zinc-400 mt-3">Preisgelder ausgezahlt</div>
          </div>
          <div>
            <div className="text-7xl font-black text-green-500">4.9</div>
            <div className="text-zinc-400 mt-3">Durchschnittliche Bewertung</div>
          </div>
        </div>
      </div>

      <footer className="bg-black py-12 text-center text-zinc-500 border-t border-zinc-900 relative z-10">
        © 2026 RankedDarts • Das Faceit für Dartspieler
      </footer>
    </div>
  );
}
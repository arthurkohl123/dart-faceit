'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, X, Swords, Trophy, Users, Activity, Target, ShieldCheck, Zap, ChevronRight, Play, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

const stats = [
  { value: '1.2k+', label: 'Aktive Spieler', icon: Users, color: 'text-emerald-400' },
  { value: '45k+', label: 'Matches gespielt', icon: Activity, color: 'text-cyan-400' },
  { value: '2.5k€', label: 'Preisgelder', icon: Trophy, color: 'text-amber-400' },
  { value: 'Top 1%', label: 'Fairplay', icon: ShieldCheck, color: 'text-blue-400' },
];

const features = [
  {
    icon: Target,
    eyebrow: 'Precision Matchmaking',
    title: 'Keine Mismatches mehr.',
    text: 'Unser Algorithmus findet Gegner, die exakt deinem Skill-Level entsprechen. Jedes Leg zählt, jede Aufnahme entscheidet.',
    gradient: 'from-emerald-500/20 to-transparent'
  },
  {
    icon: Zap,
    eyebrow: 'Instant Elo',
    title: 'Dein Fortschritt in Echtzeit.',
    text: 'Gewinne Matches, sammle Punkte und steige in den globalen Leaderboards auf. Dein Rating wird sofort nach Spielende aktualisiert.',
    gradient: 'from-cyan-500/20 to-transparent'
  },
  {
    icon: Swords,
    eyebrow: 'Pro Tournaments',
    title: 'Spiele um echtes Prestige.',
    text: 'Nimm an täglichen und wöchentlichen Turnieren teil. Gewinne exklusive Badges und Preisgelder in der Premium-Liga.',
    gradient: 'from-purple-500/20 to-transparent'
  },
];

const ranks = [
  { name: 'Bronze', range: '800 - 999', color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { name: 'Silver', range: '1000 - 1199', color: 'text-slate-300', bg: 'bg-slate-300/10', border: 'border-slate-300/20' },
  { name: 'Elite', range: '1200 - 1499', color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
  { name: 'Legend', range: '1500+', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
];

export default function Home() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsLoggedIn(true);
    });
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050607] text-white selection:bg-emerald-500/30">
      {/* Dynamic Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(34,197,94,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png' )] opacity-[0.03]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:80px_80px] opacity-[0.02]" />
      </div>

      {/* Navigation */}
      <nav className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${scrolled ? 'border-b border-white/5 bg-black/80 backdrop-blur-xl py-3' : 'bg-transparent py-5'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 md:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-40 blur transition group-hover:opacity-100"></div>
              <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-black text-xl font-black text-emerald-400 border border-emerald-500/20">R</div>
            </div>
            <div className="hidden sm:block">
              <div className="text-xl font-black tracking-tighter md:text-2xl">RANKEDDARTS</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-500/80 leading-none">The Pro Standard</div>
            </div>
          </Link>

          <div className="hidden items-center gap-8 text-[13px] font-black uppercase tracking-widest text-zinc-400 lg:flex">
            <Link href="/leaderboard" className="transition hover:text-emerald-400">Leaderboard</Link>
            <Link href="/matchmaking" className="transition hover:text-emerald-400">Matchmaking</Link>
            <Link href="/premium" className="relative transition hover:text-emerald-400">
              Premium
              <span className="absolute -right-4 -top-2 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <button
                onClick={() => router.push('/profile')}
                className="relative overflow-hidden rounded-full bg-white px-6 py-2.5 text-[13px] font-black uppercase tracking-widest text-black transition hover:scale-105 active:scale-95"
              >
                Dashboard
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/auth/login')}
                  className="hidden px-4 py-2 text-[13px] font-black uppercase tracking-widest text-zinc-400 transition hover:text-white sm:block"
                >
                  Login
                </button>
                <button
                  onClick={() => router.push('/auth/register')}
                  className="rounded-full bg-emerald-500 px-6 py-2.5 text-[13px] font-black uppercase tracking-widest text-black transition hover:bg-emerald-400 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  Join Now
                </button>
              </div>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 lg:hidden"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl lg:hidden">
          <div className="flex flex-col items-center justify-center h-full gap-8 text-2xl font-black uppercase tracking-tighter">
            <button onClick={() => setMobileMenuOpen(false)} className="absolute top-6 right-6 p-2"><X size={32} /></button>
            <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)} className="hover:text-emerald-400">Leaderboard</Link>
            <Link href="/matchmaking" onClick={() => setMobileMenuOpen(false)} className="hover:text-emerald-400">Matchmaking</Link>
            <Link href="/premium" onClick={() => setMobileMenuOpen(false)} className="hover:text-emerald-400">Premium</Link>
            <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="text-emerald-400">Mein Profil</Link>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-32 pb-20 md:px-8 lg:pt-48">
        <div className="grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Season 1 is Live
            </div>
            
            <h1 className="text-6xl font-black leading-[0.85] tracking-tight sm:text-7xl md:text-8xl lg:text-[10rem] xl:text-[11rem]">
              BECOME   

              <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">LEGENDARY.</span>
            </h1>
            
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-zinc-400 lg:mx-0 md:text-xl">
              Die weltweit erste echte Competitive-Plattform für Darts. Finde Gegner, gewinne Elo und dominiere das Leaderboard.
            </p>

            <div className="flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
              <button
                onClick={() => router.push(isLoggedIn ? '/matchmaking' : '/auth/register')}
                className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-emerald-500 px-8 py-5 text-sm font-black uppercase tracking-widest text-black transition hover:bg-emerald-400 sm:w-auto"
              >
                <Play className="h-4 w-4 fill-current" />
                Play Now
                <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </button>
              <button
                onClick={() => router.push('/leaderboard')}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-8 py-5 text-sm font-black uppercase tracking-widest text-white transition hover:bg-white/10 sm:w-auto"
              >
                View Ranks
              </button>
            </div>
          </div>

          {/* Hero Visual - Match Preview */}
          <div className="relative hidden lg:block">
            <div className="absolute -inset-10 rounded-[3rem] bg-emerald-500/10 blur-[100px]" />
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-900/40 p-1 backdrop-blur-xl">
              <div className="rounded-[2.3rem] bg-black p-8">
                <div className="flex items-center justify-between mb-12">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Live Matchmaking</span>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">EU-West #412</div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8">
                  <div className="text-center space-y-4">
                    <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 p-px">
                      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-black text-2xl font-black">CK</div>
                    </div>
                    <div>
                      <div className="text-xl font-black tracking-tight">CheckoutKing</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Level 10</div>
                    </div>
                  </div>

                  <div className="text-4xl font-black text-zinc-800 italic">VS</div>

                  <div className="text-center space-y-4">
                    <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 p-px">
                      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-black text-2xl font-black">T2</div>
                    </div>
                    <div>
                      <div className="text-xl font-black tracking-tight">TripleTwenty</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Level 9</div>
                    </div>
                  </div>
                </div>

                <div className="mt-12 space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <span>Win Probability</span>
                    <span>52% - 48%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                    <div className="h-full w-[52%] bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Ticker */}
      <section className="border-y border-white/5 bg-white/[0.02] py-12">
        <div className="mx-auto max-w-7xl px-6 md:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center space-y-2">
                <div className={`flex justify-center ${stat.color}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
                <div className="text-3xl font-black tracking-tighter md:text-4xl">{stat.value}</div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-32 md:px-8">
        <div className="text-center space-y-4 mb-20">
          <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500">The Experience</h2>
          <p className="text-4xl font-black tracking-tight md:text-6xl">Entwickelt für die Besten.</p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="group relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-white/[0.02] p-8 transition hover:border-emerald-500/20">
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 transition group-hover:opacity-100`} />
              <div className="relative space-y-6">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-emerald-400 transition group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-black">
                  <feature.icon className="h-7 w-7" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">{feature.eyebrow}</div>
                  <h3 className="text-2xl font-black tracking-tight mb-4">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-400">{feature.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ranks Section */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-32 md:px-8">
        <div className="rounded-[3rem] border border-white/5 bg-zinc-900/20 p-8 md:p-16 backdrop-blur-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-emerald-500/5 blur-[120px] -rotate-12 translate-x-1/4" />
          
          <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <h2 className="text-4xl font-black tracking-tight md:text-6xl">Klettere die   
 Leiter hoch.</h2>
              <p className="text-lg text-zinc-400 leading-relaxed">
                Vom Anfänger bis zur Legende. Unser Elo-System ordnet dich präzise ein und gibt dir Ziele, auf die es sich zu hinarbeiten lohnt.
              </p>
              <div className="flex items-center gap-6 pt-4">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-10 w-10 rounded-full border-2 border-black bg-zinc-800" />
                  ))}
                </div>
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                  <span className="text-white">4.200+</span> Spieler bereits geranked
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {ranks.map((rank) => (
                <div key={rank.name} className={`group p-6 rounded-3xl border ${rank.border} ${rank.bg} transition hover:scale-105`}>
                  <div className={`text-2xl font-black tracking-tighter ${rank.color}`}>{rank.name}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">{rank.range} Elo</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 py-32 md:px-8 text-center">
        <div className="relative overflow-hidden rounded-[4rem] bg-gradient-to-br from-emerald-500 to-cyan-600 px-8 py-20 md:py-32">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png' )] opacity-10" />
          <div className="absolute inset-0 bg-black/20" />
          
          <div className="relative space-y-8">
            <h2 className="text-5xl font-black tracking-tighter sm:text-6xl md:text-8xl text-black leading-none">
              READY TO   
 DOMINATE?
            </h2>
            <p className="mx-auto max-w-xl text-lg font-bold text-black/70">
              Erstelle deinen Account in weniger als 30 Sekunden und starte dein erstes Ranked Match noch heute.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row pt-4">
              <button
                onClick={() => router.push('/auth/register')}
                className="w-full rounded-2xl bg-black px-10 py-5 text-sm font-black uppercase tracking-widest text-white transition hover:scale-105 active:scale-95 sm:w-auto"
              >
                Get Started Free
              </button>
              <button
                onClick={() => router.push('/matchmaking')}
                className="w-full rounded-2xl border-2 border-black/20 px-10 py-5 text-sm font-black uppercase tracking-widest text-black transition hover:bg-black/5 sm:w-auto"
              >
                Quick Match
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 bg-black py-12">
        <div className="mx-auto max-w-7xl px-6 md:px-8 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-black font-black">R</div>
            <span className="text-sm font-black tracking-widest">RANKEDDARTS</span>
          </div>
          <div className="flex gap-8 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/support" className="hover:text-white">Support</Link>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">
            © 2026 RankedDarts. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}

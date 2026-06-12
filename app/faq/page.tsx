'use client';

import { useState, useEffect } from 'react';
import { 
  Search, ChevronDown, ChevronUp, HelpCircle, 
  ShieldCheck, Video, Trophy, Users, Star, 
  Target, AlertTriangle, Scale, Info, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

type FAQItem = {
  question: string;
  answer: string;
  category: string;
  icon: any;
  important?: boolean;
};

const faqData: FAQItem[] = [
  {
    category: "Regeln & Fairplay",
    question: "Gibt es eine Kamerapflicht beim Spielen?",
    answer: "Ja, absolut! Um die Integrität unserer Wettbewerbe zu gewährleisten, herrscht bei RankedDarts eine strikte Kamerapflicht. Dies gilt ausnahmslos für alle Spiele, egal ob über Scolia oder Dartcounter gespielt wird. Spieler ohne aktive Kamera riskieren den sofortigen Ausschluss vom Match und einen permanenten Ban.",
    icon: Video,
    important: true
  },
  {
    category: "Regeln & Fairplay",
    question: "Was passiert bei Unstimmigkeiten im Ergebnis?",
    answer: "Beide Spieler müssen das Ergebnis nach dem Match bestätigen. Sollte es zu Unstimmigkeiten kommen, wird das Match automatisch an unsere Moderatoren weitergeleitet. In diesem Fall sind Beweise (Fotos vom Board/Score) über unser Support-System einzureichen.",
    icon: ShieldCheck
  },
  {
    category: "Elo-System",
    question: "Wie funktioniert das Elo-System?",
    answer: "Dein Elo-Rating spiegelt deine Spielstärke wider. Gewinnst du gegen einen stärkeren Gegner (höheres Elo), erhältst du mehr Punkte. Verlierst du gegen einen schwächeren Gegner, verlierst du mehr Punkte. Alle neuen Spieler starten bei 1.000 Elo.",
    icon: Trophy
  },
  {
    category: "Elo-System",
    question: "Warum verändert sich mein Elo nach einem Sieg kaum?",
    answer: "Wenn du gegen einen Spieler gewinnst, der deutlich weniger Elo hat als du, ist der Punktegewinn geringer, da der Sieg statistisch erwartet wurde. Unser System ist darauf ausgelegt, wahre Spielstärke über viele Matches hinweg präzise zu messen.",
    icon: Target
  },
  {
    category: "Mitgliedschaft",
    question: "Was bringt mir die Premium-Mitgliedschaft?",
    answer: "Premium-Mitglieder genießen exklusive Vorteile: Teilnahme an Preisgeld-Turnieren, ein goldenes Abzeichen im Leaderboard, detaillierte Match-Statistiken (AVG, Checkout-Quoten) und bevorzugten Support bei Match-Disputen.",
    icon: Star
  },
  {
    category: "Allgemein",
    question: "Kann ich meinen Benutzernamen ändern?",
    answer: "Benutzernamen sind fest mit deinem Profil verknüpft, um die Historie deiner Matches konsistent zu halten. Namensänderungen sind nur in Ausnahmefällen über ein Support-Ticket möglich.",
    icon: Users
  },
  {
    category: "Regeln & Fairplay",
    question: "Was passiert, wenn mein Gegner nicht auftaucht?",
    answer: "Wenn ein Gegner 15 Minuten nach Match-Start nicht erscheint, kannst du einen 'No-Show' melden. Der Spieler erhält eine automatische Zeitstrafe für das Matchmaking und das Match wird annulliert.",
    icon: AlertTriangle
  }
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const filteredFaq = faqData.filter(item => 
    item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#020304] text-zinc-100 selection:bg-emerald-500/30 font-sans overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-emerald-500/5 blur-[120px] rounded-full opacity-50" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-cyan-500/5 blur-[120px] rounded-full opacity-50" />
      </div>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-black/80 backdrop-blur-xl py-4 border-b border-white/5' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-10 h-10 md:w-11 md:h-11 bg-emerald-500 rounded-xl flex items-center justify-center text-black font-black text-xl md:text-2xl shadow-2xl transition-all group-hover:rotate-6">R</div>
            <div className="flex flex-col">
              <span className="text-lg md:text-xl font-black tracking-tighter uppercase leading-none">RankedDarts</span>
              <span className="text-[8px] md:text-[9px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">Help Center</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-12 text-[11px] font-black uppercase tracking-[0.3em] text-zinc-400">
            <Link href="/" className="hover:text-white transition-all">Home</Link>
            <Link href="/leaderboard" className="hover:text-white transition-all">Leaderboard</Link>
            <Link href="/matchmaking" className="hover:text-white transition-all">Matchmaking</Link>
          </div>
          <Link href={isLoggedIn ? '/profile' : '/auth/login'} className="px-6 md:px-8 py-2 md:py-3 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all">
            {isLoggedIn ? 'Dashboard' : 'Sign In'}
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-48 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-[0.5em] text-emerald-400 backdrop-blur-md">
            <HelpCircle className="w-3.5 h-3.5" /> Support & Rules
          </div>
          <h1 className="text-5xl md:text-8xl font-black tracking-tighter italic uppercase leading-[0.8]">FAQ</h1>
          <p className="text-zinc-500 text-lg md:text-xl font-medium leading-relaxed max-w-2xl mx-auto">
            Alles was du über <span className="text-white font-bold italic">RankedDarts</span>, das Elo-System und unsere Fairplay-Regeln wissen musst.
          </p>

          <div className="relative max-w-2xl mx-auto mt-12 group">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition-opacity duration-500" />
            <div className="relative bg-zinc-900/50 border border-white/10 rounded-2xl flex items-center px-6 py-5 backdrop-blur-2xl">
              <Search className="w-5 h-5 text-zinc-500 mr-4" />
              <input 
                type="text" 
                placeholder="Suche nach einer Frage..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm font-bold w-full placeholder:text-zinc-700 text-white"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Content */}
      <section className="relative z-10 pb-40 px-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {filteredFaq.length > 0 ? (
            filteredFaq.map((item, index) => (
              <div 
                key={index} 
                className={`group rounded-[2rem] border transition-all duration-500 overflow-hidden ${
                  openIndex === index 
                    ? 'bg-zinc-900/40 border-emerald-500/30' 
                    : 'bg-zinc-900/20 border-white/5 hover:border-white/10'
                } ${item.important ? 'ring-1 ring-emerald-500/20' : ''}`}
              >
                <button 
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full p-8 flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-6">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                      openIndex === index ? 'bg-emerald-500 text-black' : 'bg-white/5 text-zinc-400 group-hover:text-white'
                    }`}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">
                        {item.category} {item.important && "• WICHTIG"}
                      </div>
                      <h3 className="text-lg md:text-xl font-black tracking-tight italic uppercase leading-tight">
                        {item.question}
                      </h3>
                    </div>
                  </div>
                  <div className="ml-4">
                    {openIndex === index ? <ChevronUp className="w-6 h-6 text-emerald-500" /> : <ChevronDown className="w-6 h-6 text-zinc-600" />}
                  </div>
                </button>
                
                {openIndex === index && (
                  <div className="px-8 pb-8 pt-0 ml-16 md:ml-24">
                    <div className="h-px bg-white/5 mb-6" />
                    <p className="text-zinc-400 text-base md:text-lg leading-relaxed font-medium">
                      {item.answer}
                    </p>
                    {item.important && (
                      <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-start gap-3">
                        <Info className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs font-bold text-emerald-400/80 leading-relaxed uppercase tracking-wider">
                          Verstöße gegen diese Regel führen zu sofortigen Sanktionen.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-20 bg-zinc-900/20 border border-white/5 rounded-[3rem]">
              <HelpCircle className="w-16 h-16 text-zinc-800 mx-auto mb-6" />
              <h3 className="text-xl font-black uppercase italic text-zinc-600">Keine Ergebnisse gefunden</h3>
              <button onClick={() => setSearchQuery('')} className="mt-4 text-emerald-500 font-bold uppercase text-xs tracking-widest hover:underline">Suche zurücksetzen</button>
            </div>
          )}
        </div>

        {/* Support CTA */}
        <div className="max-w-4xl mx-auto mt-32 p-12 md:p-16 rounded-[3rem] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 text-center relative overflow-hidden group">
          <div className="absolute -bottom-10 -right-10 text-[15rem] font-black text-white/[0.02] italic select-none">?</div>
          <h3 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter mb-6">Noch Fragen offen?</h3>
          <p className="text-zinc-400 text-lg mb-10 max-w-xl mx-auto font-medium">Unser Support-Team hilft dir gerne bei individuellen Anliegen oder Match-Disputen weiter.</p>
          <Link href="/support" className="inline-flex items-center gap-3 px-12 py-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest transition-all hover:scale-105 shadow-xl shadow-emerald-500/20">
            Support kontaktieren <ArrowLeft className="w-5 h-5 rotate-180" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 pt-20 pb-10 border-t border-white/5 text-center">
        <div className="max-w-7xl mx-auto px-12 flex flex-col md:flex-row items-center justify-between gap-12 mb-20">
          <Link href="/" className="flex items-center gap-4 group">
            <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white font-black text-xl">R</div>
            <div className="flex flex-col text-left leading-none">
              <span className="text-lg font-black tracking-tighter uppercase">RankedDarts</span>
              <span className="text-[8px] font-black text-emerald-500 tracking-[0.4em] uppercase mt-1">The Pro Standard</span>
            </div>
          </Link>
          <div className="flex items-center gap-12 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/support">Support</Link>
          </div>
        </div>
        <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-[0.5em]">© 2026 RankedDarts. Built for the elite.</div>
      </footer>
    </main>
  );
}
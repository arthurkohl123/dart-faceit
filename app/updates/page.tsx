'use client';

import { useRouter } from 'next/navigation';

const updates = [
  {
    date: "21. Mai 2026",
    title: "Premium Abonnement ist live!",
    category: "Feature",
    content: "Ab sofort kannst du RankedDarts Premium für 4,99 €/Monat abschließen. Vorteile: Keine Wartezeit, exklusive Ränge, detaillierte Stats und werbefreies Erlebnis.",
    highlight: true
  },
  {
    date: "19. Mai 2026",
    title: "Neues Design für Leaderboard",
    category: "Design",
    content: "Die Rangliste wurde komplett überarbeitet mit besserer Optik, Hover-Effekten und Premium-Hervorhebungen.",
  },
  {
    date: "18. Mai 2026",
    title: "Matchmaking verbessert",
    category: "Matchmaking",
    content: "Die Wartezeit wurde reduziert und das System sucht jetzt noch genauer nach Gegnern mit ähnlichem Skill-Level.",
  },
  {
    date: "15. Mai 2026",
    title: "Launch von RankedDarts",
    category: "Announcement",
    content: "Offizieller Start der Plattform. Willkommen in der Dart-Community!",
    highlight: true
  }
];

export default function Updates() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-8 py-16">
        
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-6xl font-black tracking-tighter">UPDATES</h1>
            <p className="text-xl text-zinc-400 mt-2">Was neu ist bei RankedDarts</p>
          </div>
          <button 
            onClick={() => router.push('/profile')}
            className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
          >
            ← Zurück
          </button>
        </div>

        <div className="space-y-8">
          {updates.map((update, index) => (
            <div 
              key={index}
              className={`bg-zinc-900 border ${update.highlight ? 'border-green-500' : 'border-zinc-700'} rounded-3xl p-10 hover:border-green-500/50 transition-all`}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-xs uppercase tracking-widest text-green-400">{update.category}</span>
                  <h2 className="text-3xl font-bold mt-2">{update.title}</h2>
                </div>
                <span className="text-sm text-zinc-500 whitespace-nowrap">{update.date}</span>
              </div>
              
              <p className="text-zinc-300 leading-relaxed text-lg">
                {update.content}
              </p>

              {update.highlight && (
                <div className="mt-6 inline-block bg-green-500/10 text-green-400 text-sm px-5 py-2 rounded-full border border-green-500/30">
                  NEU
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-center text-zinc-500 mt-16">
          Weitere Updates folgen regelmäßig
        </div>
      </div>
    </div>
  );
}
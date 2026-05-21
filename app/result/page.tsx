'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function MatchResult() {
  const [legsWon, setLegsWon] = useState(0);
  const [legsLost, setLegsLost] = useState(0);
  const [average, setAverage] = useState('');
  const [highestCheckout, setHighestCheckout] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();
  const router = useRouter();

  const submitResult = async () => {
    if (legsWon === 0 && legsLost === 0) return;
    
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth/login');
      return;
    }

    // Profil laden
    const { data: profile } = await supabase
      .from('profiles')
      .select('elo, gamesPlayed, wins')
      .eq('supabaseId', session.user.id)
      .single();

    const isWin = legsWon > legsLost;
    const currentElo = profile?.elo || 1000;
    const opponentElo = 1020;
    const K = 32;

    const score = isWin ? 1 : 0;
    const expected = 1 / (1 + Math.pow(10, (opponentElo - currentElo) / 400));
    const eloChange = Math.round(K * (score - expected));
    const newElo = currentElo + eloChange;

    // Match in matches-Tabelle speichern
    await supabase.from('matches').insert({
      user_id: session.user.id,
      opponent_name: "DartKing42",
      opponent_elo: opponentElo,
      legs_won: legsWon,
      legs_lost: legsLost,
      result: `${legsWon}:${legsLost}`,
      is_win: isWin,
      my_average: parseFloat(average) || null,
      highest_checkout: parseInt(highestCheckout) || null,
      elo_change: eloChange
    });

    // Profil aktualisieren
    await supabase
      .from('profiles')
      .update({
        elo: newElo,
        gamesPlayed: (profile?.gamesPlayed || 0) + 1,
        wins: isWin ? (profile?.wins || 0) + 1 : (profile?.wins || 0)
      })
      .eq('supabaseId', session.user.id);

    alert(`✅ Match gespeichert!\n${legsWon}:${legsLost} Legs\nElo-Veränderung: ${eloChange > 0 ? '+' : ''}${eloChange}`);
    router.push('/history');   // Direkt zur History
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-10">Ergebnis eintragen</h1>

        <div className="bg-zinc-900 rounded-3xl p-10">
          <div className="text-center mb-10">
            <p className="text-xl">Gegner: <strong>DartKing42</strong> (1020 Elo)</p>
          </div>

          {/* Legs */}
          <div className="mb-12">
            <label className="block text-center text-zinc-400 mb-6 text-lg">Legs</label>
            <div className="flex justify-center items-center gap-12">
              <div className="text-center">
                <button onClick={() => setLegsWon(l => Math.max(0, l-1))} className="text-5xl px-6 text-zinc-400 hover:text-white">-</button>
                <span className="text-7xl font-bold mx-8 text-green-500">{legsWon}</span>
                <button onClick={() => setLegsWon(l => l+1)} className="text-5xl px-6 text-zinc-400 hover:text-white">+</button>
                <p className="text-sm text-green-500 mt-2">Ich</p>
              </div>

              <div className="text-6xl text-zinc-600">:</div>

              <div className="text-center">
                <button onClick={() => setLegsLost(l => Math.max(0, l-1))} className="text-5xl px-6 text-zinc-400 hover:text-white">-</button>
                <span className="text-7xl font-bold mx-8 text-red-500">{legsLost}</span>
                <button onClick={() => setLegsLost(l => l+1)} className="text-5xl px-6 text-zinc-400 hover:text-white">+</button>
                <p className="text-sm text-red-500 mt-2">Gegner</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-10">
            <div>
              <label className="block text-zinc-400 mb-3">Average</label>
              <input 
                type="number" 
                step="0.01"
                value={average}
                onChange={(e) => setAverage(e.target.value)}
                className="w-full bg-zinc-800 p-5 rounded-2xl text-2xl text-center"
                placeholder="84.7"
              />
            </div>
            <div>
              <label className="block text-zinc-400 mb-3">Höchster Checkout</label>
              <input 
                type="number"
                value={highestCheckout}
                onChange={(e) => setHighestCheckout(e.target.value)}
                className="w-full bg-zinc-800 p-5 rounded-2xl text-2xl text-center"
                placeholder="170"
              />
            </div>
          </div>

          <button 
            onClick={submitResult}
            disabled={loading || (legsWon === 0 && legsLost === 0)}
            className="w-full py-7 bg-green-600 hover:bg-green-700 text-2xl font-bold rounded-3xl disabled:opacity-50"
          >
            {loading ? "Wird gespeichert..." : "Match speichern"}
          </button>
        </div>

        <button 
          onClick={() => router.push('/profile')}
          className="mt-8 text-zinc-400 hover:text-white block mx-auto"
        >
          ← Abbrechen
        </button>
      </div>
    </div>
  );
}
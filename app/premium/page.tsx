'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Premium() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('supabaseId', session.user.id)
        .single();

      setUser(data);
      setLoading(false);
    };

    getUser();
  }, []);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Lade...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white py-20">
      <div className="max-w-2xl mx-auto px-8">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-black mb-4">Premium</h1>
          <p className="text-2xl text-zinc-400">Nur 4,99 € / Monat</p>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-12 border border-green-500/30">
          <div className="text-center mb-10">
            <div className="text-7xl mb-6">⭐</div>
            <h2 className="text-4xl font-bold mb-2">RankedDarts Premium</h2>
            <p className="text-green-400 text-xl">4,99 € / Monat</p>
          </div>

          <ul className="space-y-6 mb-12 text-lg">
            <li className="flex items-center gap-4">✅ Keine Wartezeit beim Matchmaking</li>
            <li className="flex items-center gap-4">✅ Exklusive Premium-Ränge</li>
            <li className="flex items-center gap-4">✅ Detaillierte Statistiken & Heatmaps</li>
            <li className="flex items-center gap-4">✅ Werbefrei</li>
            <li className="flex items-center gap-4">✅ Priorität beim Support</li>
          </ul>

          <button 
            disabled
            className="w-full py-8 bg-zinc-700 text-zinc-400 text-3xl font-bold rounded-3xl cursor-not-allowed"
          >
            Bald verfügbar
          </button>

          <p className="text-center text-zinc-500 text-sm mt-8">
            Premium wird in Kürze freigeschaltet
          </p>
        </div>

        <button 
          onClick={() => router.push('/profile')}
          className="mt-8 text-zinc-400 hover:text-white block mx-auto"
        >
          ← Zurück zum Profil
        </button>
      </div>
    </div>
  );
}
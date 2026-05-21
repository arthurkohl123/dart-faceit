'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminPanel() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return router.push('/auth/login');

    const { data: me } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('supabaseId', session.user.id)
      .single();

    if (!me?.is_admin) {
      alert("Du hast keinen Admin-Zugriff!");
      return router.push('/');
    }

    loadProfiles();
  };

  const loadProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('elo', { ascending: false });

    setProfiles(data || []);
    setLoading(false);
  };

  const updateElo = async (id: string, newElo: number) => {
    await supabase.from('profiles').update({ elo: newElo }).eq('id', id);
    loadProfiles();
  };

  const toggleBan = async (user: any) => {
    const newStatus = !user.is_banned;
    const reason = newStatus ? prompt('Ban-Grund eingeben:') : null;

    await supabase
      .from('profiles')
      .update({ is_banned: newStatus, ban_reason: reason })
      .eq('id', user.id);

    loadProfiles();
  };

  const toggleAdmin = async (id: string, current: boolean) => {
    await supabase
      .from('profiles')
      .update({ is_admin: !current })
      .eq('id', id);
    loadProfiles();
  };

  const filtered = profiles.filter(p =>
    p.username?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-2xl">Lade Admin Panel...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🔧</span>
            <h1 className="text-4xl font-black">Admin Panel</h1>
          </div>
          <button 
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl"
          >
            ← Zurück zum Profil
          </button>
        </div>

        <input
          type="text"
          placeholder="Benutzer suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-6 py-4 mb-8 text-lg"
        />

        <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-700">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-800 border-b border-zinc-700">
                <th className="text-left p-6">Benutzername</th>
                <th className="text-center p-6">Elo</th>
                <th className="text-center p-6">Spiele</th>
                <th className="text-center p-6">Siege</th>
                <th className="text-center p-6">Status</th>
                <th className="text-center p-6">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b border-zinc-800 hover:bg-zinc-800/70">
                  <td className="p-6 font-medium">{user.username}</td>
                  <td className="p-6 text-center">
                    <input
                      type="number"
                      defaultValue={user.elo}
                      onBlur={(e) => updateElo(user.id, Number(e.target.value))}
                      className="bg-transparent text-center w-24 font-bold focus:bg-zinc-800 rounded p-1"
                    />
                  </td>
                  <td className="p-6 text-center">{user.gamesPlayed}</td>
                  <td className="p-6 text-center text-green-500">{user.wins}</td>
                  <td className="p-6 text-center">
                    {user.is_banned ? (
                      <span className="bg-red-600/20 text-red-500 px-4 py-1 rounded-full text-sm">GEBANNT</span>
                    ) : user.is_admin ? (
                      <span className="bg-purple-600/20 text-purple-400 px-4 py-1 rounded-full text-sm">ADMIN</span>
                    ) : (
                      <span className="bg-green-600/20 text-green-500 px-4 py-1 rounded-full text-sm">Aktiv</span>
                    )}
                  </td>
                  <td className="p-6 text-center space-x-3">
                    <button
                      onClick={() => toggleBan(user)}
                      className={`px-5 py-2.5 rounded-2xl text-sm font-medium ${user.is_banned ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}
                    >
                      {user.is_banned ? 'Entbannen' : 'Bannen'}
                    </button>
                    <button
                      onClick={() => toggleAdmin(user.id, user.is_admin)}
                      className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-2xl text-sm font-medium"
                    >
                      {user.is_admin ? 'Admin entfernen' : 'Zum Admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-zinc-500 mt-8">
          {profiles.length} Spieler insgesamt
        </p>
      </div>
    </div>
  );
}
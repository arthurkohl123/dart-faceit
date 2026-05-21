'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Profile {
  id: string;
  supabaseId: string;
  username: string;
  email: string;
  elo: number;
  gamesPlayed: number;
  wins: number;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason?: string;
}

export default function AdminPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    checkAdminAccess();
    loadAllProfiles();
  }, []);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('supabaseId', session.user.id)
      .single();

    if (!profile?.is_admin) {
      alert("Kein Admin-Zugriff");
      router.push('/');
    }
  };

  const loadAllProfiles = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('elo', { ascending: false });

    setProfiles(data || []);
    setLoading(false);
  };

  const updateElo = async (userId: string, newElo: number) => {
    await supabase
      .from('profiles')
      .update({ elo: newElo })
      .eq('id', userId);

    loadAllProfiles();
  };

  const toggleBan = async (user: Profile) => {
    const newBanStatus = !user.is_banned;
    const reason = newBanStatus ? prompt("Ban-Grund eingeben:") : null;

    await supabase
      .from('profiles')
      .update({ 
        is_banned: newBanStatus,
        ban_reason: reason 
      })
      .eq('id', user.id);

    loadAllProfiles();
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    await supabase
      .from('profiles')
      .update({ is_admin: !currentStatus })
      .eq('id', userId);
    loadAllProfiles();
  };

  const filteredProfiles = profiles.filter(p => 
    p.username.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Lade Admin Panel...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="bg-black border-b border-zinc-800 p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-4xl font-black">Admin Panel</h1>
          <button onClick={() => router.push('/')} className="text-green-400 hover:text-green-500">← Zurück zur Seite</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8">
          <input
            type="text"
            placeholder="Spieler suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-6 py-4 text-lg"
          />
        </div>

        <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-700">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800">
                <th className="text-left p-6">Spieler</th>
                <th className="text-left p-6">Email</th>
                <th className="text-center p-6">Elo</th>
                <th className="text-center p-6">Spiele</th>
                <th className="text-center p-6">Status</th>
                <th className="text-center p-6">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.map((user) => (
                <tr key={user.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                  <td className="p-6 font-medium">{user.username}</td>
                  <td className="p-6 text-zinc-400">{user.email}</td>
                  <td className="p-6 text-center">
                    <input
                      type="number"
                      defaultValue={user.elo}
                      onBlur={(e) => updateElo(user.id, parseInt(e.target.value))}
                      className="bg-transparent text-center w-20 font-bold focus:outline-none focus:bg-zinc-800 rounded px-2"
                    />
                  </td>
                  <td className="p-6 text-center">{user.gamesPlayed}</td>
                  <td className="p-6 text-center">
                    {user.is_banned ? (
                      <span className="bg-red-500/20 text-red-500 px-4 py-1 rounded-full text-sm">Banned</span>
                    ) : user.is_admin ? (
                      <span className="bg-purple-500/20 text-purple-400 px-4 py-1 rounded-full text-sm">Admin</span>
                    ) : (
                      <span className="bg-green-500/20 text-green-500 px-4 py-1 rounded-full text-sm">Aktiv</span>
                    )}
                  </td>
                  <td className="p-6 text-center space-x-3">
                    <button
                      onClick={() => toggleBan(user)}
                      className={`px-5 py-2 rounded-2xl text-sm font-medium ${user.is_banned ? 'bg-green-600' : 'bg-red-600'}`}
                    >
                      {user.is_banned ? 'Entbannen' : 'Bannen'}
                    </button>
                    <button
                      onClick={() => toggleAdmin(user.id, user.is_admin)}
                      className="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-2xl text-sm font-medium"
                    >
                      {user.is_admin ? 'Admin entfernen' : 'Zum Admin machen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 text-center text-zinc-500 text-sm">
          Insgesamt {profiles.length} registrierte Spieler
        </div>
      </div>
    </div>
  );
}
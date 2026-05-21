'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newElo, setNewElo] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    checkAdminAndLoadUsers();
  }, []);

  const checkAdminAndLoadUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    // Einfacher Admin-Check (du kannst das später erweitern)
    if (!session || session.user.email !== 'berent.arthur@gmx.de') {  // ← HIER DEINE EMAIL EINTRAGEN
      alert("Kein Admin-Zugriff");
      router.push('/profile');
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('elo', { ascending: false });

    setUsers(data || []);
    setLoading(false);
  };

  const updateElo = async (userId: string) => {
    if (!newElo) return;

    await supabase
      .from('profiles')
      .update({ elo: parseInt(newElo) })
      .eq('supabaseId', userId);

    alert("Elo aktualisiert!");
    setEditingUser(null);
    setNewElo('');
    checkAdminAndLoadUsers(); // Refresh
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Lade Admin-Panel...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">🔧 Admin Panel - Elo Management</h1>

        <div className="bg-zinc-900 rounded-3xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="py-5 px-8 text-left">Benutzername</th>
                <th className="py-5 px-8 text-center">Aktuelles Elo</th>
                <th className="py-5 px-8 text-center">Spiele</th>
                <th className="py-5 px-8 text-center">Siege</th>
                <th className="py-5 px-8 text-center">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.supabaseId} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                  <td className="py-5 px-8 font-medium">{user.username}</td>
                  <td className="py-5 px-8 text-center text-2xl font-bold">{user.elo}</td>
                  <td className="py-5 px-8 text-center">{user.gamesPlayed}</td>
                  <td className="py-5 px-8 text-center text-green-500">{user.wins}</td>
                  <td className="py-5 px-8 text-center">
                    {editingUser?.supabaseId === user.supabaseId ? (
                      <div className="flex gap-2 justify-center">
                        <input 
                          type="number" 
                          value={newElo}
                          onChange={(e) => setNewElo(e.target.value)}
                          className="bg-zinc-800 w-24 p-2 rounded-lg text-center"
                          placeholder="Neues Elo"
                        />
                        <button onClick={() => updateElo(user.supabaseId)} className="bg-green-600 px-4 py-2 rounded-lg">Speichern</button>
                        <button onClick={() => setEditingUser(null)} className="bg-zinc-700 px-4 py-2 rounded-lg">Abbrechen</button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          setEditingUser(user);
                          setNewElo(user.elo);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg text-sm"
                      >
                        Elo ändern
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button 
          onClick={() => router.push('/profile')}
          className="mt-8 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl"
        >
          ← Zurück zum Profil
        </button>
      </div>
    </div>
  );
}
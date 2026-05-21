'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) {
      alert('Fehler: ' + error.message);
    } else if (data.user) {
      // Profil automatisch erstellen
      await supabase.from('profiles').insert({
        supabaseId: data.user.id,
        username: username,
        elo: 1000,
        gamesPlayed: 0,
        wins: 0
      });

      alert('Registrierung erfolgreich! Du kannst dich jetzt einloggen.');
      router.push('/auth/login');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-md">
        <h1 className="text-4xl font-bold text-center mb-8">Dart Faceit - Registrieren</h1>
        
        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            placeholder="Benutzername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-4 bg-zinc-800 rounded-xl"
            required
          />
          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 bg-zinc-800 rounded-xl"
            required
          />
          <input
            type="password"
            placeholder="Passwort (min. 6 Zeichen)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 bg-zinc-800 rounded-xl"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 p-4 rounded-xl font-semibold text-lg"
          >
            {loading ? 'Wird erstellt...' : 'Account erstellen'}
          </button>
        </form>

        <p className="text-center mt-6">
          Schon registriert? <a href="/auth/login" className="text-green-500">Zum Login</a>
        </p>
      </div>
    </div>
  );
}
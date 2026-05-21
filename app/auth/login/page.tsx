'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) alert('Fehler: ' + error.message);
    else router.push('/profile');

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-md">
        <h1 className="text-4xl font-bold text-center mb-8">Dart Faceit</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-zinc-800 rounded-xl" required />
          <input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 bg-zinc-800 rounded-xl" required />
          <button type="submit" disabled={loading} className="w-full bg-green-600 hover:bg-green-700 p-4 rounded-xl font-semibold text-lg">
            {loading ? 'Einloggen...' : 'Einloggen'}
          </button>
        </form>
        <p className="text-center mt-6">
          Noch kein Account? <a href="/auth/register" className="text-green-500">Registrieren</a>
        </p>
      </div>
    </div>
  );
}
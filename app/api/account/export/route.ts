import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { consumeRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const limit = await consumeRateLimit('account', request, user.id);
  if (!limit.allowed) return NextResponse.json({ error: 'Bitte versuche es später erneut.' }, { status: 429 });

  // The browser-facing history is intentionally limited by the Premium RLS
  // policy. A verified account-data export remains complete and uses the
  // server-only client only after the requesting user's identity is known.
  const admin = createAdminClient();
  const [profile, matches, notifications, tournaments, tickets] = await Promise.all([
    supabase.from('profiles').select('*').eq('supabaseId', user.id).maybeSingle(),
    admin.from('matches').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('tournament_participants').select('*').eq('user_id', user.id).order('joined_at', { ascending: false }),
    supabase.rpc('get_my_tickets'),
  ]);

  const body = JSON.stringify({
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at },
    profile: profile.data,
    matches: matches.data ?? [],
    notifications: notifications.data ?? [],
    tournamentParticipations: tournaments.data ?? [],
    supportTickets: tickets.data ?? [],
  }, null, 2);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="rankeddarts-data-${new Date().toISOString().slice(0,10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

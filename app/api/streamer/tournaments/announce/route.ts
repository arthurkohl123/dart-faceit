import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ANNOUNCEMENT_STALE_AFTER_MS = 10 * 60_000;

type StreamerTournament = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  registration_closes_at: string;
  max_players: number;
  best_of: number;
  scoring_platform: 'scolia' | 'dartcounter' | 'autodarts';
  tournament_format: 'single_elimination' | 'double_elimination' | 'group_stage';
  dart_mode: 'straight_in_double_out' | 'double_in_double_out';
  status: string;
  creator_announcement_sent_at: string | null;
  creator_announcement_pending_at: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

function platformLabel(platform: StreamerTournament['scoring_platform']) {
  return platform === 'scolia' ? 'Scolia' : platform === 'dartcounter' ? 'DartCounter' : 'AutoDarts';
}

function formatLabel(format: StreamerTournament['tournament_format']) {
  return format === 'single_elimination'
    ? 'Single Elimination'
    : format === 'double_elimination'
      ? 'Double Elimination'
      : 'Gruppenphase';
}

function dartModeLabel(mode: StreamerTournament['dart_mode']) {
  return mode === 'double_in_double_out' ? 'Double In · Double Out' : 'Single In · Double Out';
}

function truncate(value: string, maximum: number) {
  const trimmed = value.trim();
  return trimmed.length > maximum ? `${trimmed.slice(0, maximum - 1)}…` : trimmed;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  let body: { tournamentId?: string };
  try {
    body = await request.json() as { tournamentId?: string };
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }
  if (!body.tournamentId || !/^[0-9a-f-]{36}$/i.test(body.tournamentId)) {
    return NextResponse.json({ error: 'Turnier-ID fehlt oder ist ungültig.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('username, is_streamer')
    .eq('supabaseId', user.id)
    .maybeSingle<{ username: string | null; is_streamer: boolean | null }>();
  if (actorError) return NextResponse.json({ error: 'Berechtigung konnte nicht geprüft werden.' }, { status: 500 });
  if (!actor?.is_streamer) return NextResponse.json({ error: 'Streamer-Berechtigung erforderlich.' }, { status: 403 });

  const { data: tournament, error: tournamentError } = await admin
    .from('tournaments')
    .select('id, title, description, starts_at, registration_closes_at, max_players, best_of, scoring_platform, tournament_format, dart_mode, status, creator_announcement_sent_at, creator_announcement_pending_at')
    .eq('id', body.tournamentId)
    .eq('created_by', user.id)
    .eq('streamer_hosted', true)
    .maybeSingle<StreamerTournament>();
  if (tournamentError) return NextResponse.json({ error: 'Turnier konnte nicht geladen werden.' }, { status: 500 });
  if (!tournament) return NextResponse.json({ error: 'Dieses Streamer-Turnier gehört dir nicht.' }, { status: 403 });
  if (tournament.status !== 'registration') return NextResponse.json({ error: 'Nur Turniere mit offener Anmeldung können angekündigt werden.' }, { status: 409 });
  if (tournament.creator_announcement_sent_at) {
    return NextResponse.json({ announced: true, alreadySent: true, sentAt: tournament.creator_announcement_sent_at });
  }
  if (tournament.creator_announcement_pending_at) {
    const pendingSince = Date.parse(tournament.creator_announcement_pending_at);
    if (!Number.isNaN(pendingSince) && Date.now() - pendingSince < ANNOUNCEMENT_STALE_AFTER_MS) {
      return NextResponse.json({ error: 'Die Discord-Ankündigung wird bereits gesendet. Bitte warte einen Moment.' }, { status: 409 });
    }

    // A process can stop between claiming and delivering the webhook. Let the
    // host recover a stale claim instead of permanently hiding the retry button.
    await admin.from('tournaments').update({
      creator_announcement_pending_at: null,
      creator_announcement_error: 'Die vorherige Discord-Ankündigung wurde nicht abgeschlossen. Du kannst es erneut versuchen.',
    }).eq('id', tournament.id).eq('creator_announcement_pending_at', tournament.creator_announcement_pending_at);
  }

  const { data: claimed, error: claimError } = await admin
    .from('tournaments')
    .update({ creator_announcement_pending_at: new Date().toISOString(), creator_announcement_error: null })
    .eq('id', tournament.id)
    .is('creator_announcement_sent_at', null)
    .is('creator_announcement_pending_at', null)
    .select('id')
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: 'Discord-Ankündigung konnte nicht vorbereitet werden.' }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: 'Die Discord-Ankündigung wird bereits verarbeitet.' }, { status: 409 });

  const webhookUrl = process.env.DISCORD_TOURNAMENT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    await admin.from('tournaments').update({
      creator_announcement_pending_at: null,
      creator_announcement_error: 'Discord-Webhook ist nicht konfiguriert.',
    }).eq('id', tournament.id);
    return NextResponse.json({ error: 'Discord ist noch nicht verbunden. Bitte informiere das RankedDarts-Team.' }, { status: 503 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rankeddarts.de').replace(/\/$/, '');
  const tournamentUrl = `${siteUrl}/tournaments/${tournament.id}`;
  const description = truncate(tournament.description || 'Die Anmeldung ist jetzt geöffnet. Sichere dir deinen Platz und sei beim Community-Cup dabei.', 900);
  const payload = {
    username: 'RankedDarts Creator Hub',
    avatar_url: `${siteUrl}/icon`,
    // A streamer event is visible in the fixed tournament channel, but it never
    // notifies @everyone or other roles without an explicit admin action.
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: `🎥 ${truncate(tournament.title, 220)}`,
      url: tournamentUrl,
      description,
      color: 0xd946ef,
      author: { name: `Hosted by ${truncate(actor.username || 'RankedDarts Streamer', 120)}` },
      fields: [
        { name: '🗓️ Turnierstart', value: formatDate(tournament.starts_at), inline: true },
        { name: '⏳ Anmeldung bis', value: formatDate(tournament.registration_closes_at), inline: true },
        { name: '👥 Plätze', value: `${tournament.max_players} Teilnehmer`, inline: true },
        { name: '🎯 Plattform', value: platformLabel(tournament.scoring_platform), inline: true },
        { name: '📋 Format', value: `${formatLabel(tournament.tournament_format)} · Best of ${tournament.best_of}`, inline: true },
        { name: '🎲 Spielmodus', value: dartModeLabel(tournament.dart_mode), inline: true },
        { name: '💚 Community Cup', value: 'Kostenlos · öffentlich · ohne Preisgeld', inline: false },
      ],
      footer: { text: 'RankedDarts · Streamer-Event' },
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const url = new URL(webhookUrl);
    url.searchParams.set('wait', 'true');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);

    await admin.from('tournaments').update({
      creator_announcement_pending_at: null,
      creator_announcement_sent_at: new Date().toISOString(),
      creator_announcement_error: null,
    }).eq('id', tournament.id);
    return NextResponse.json({ announced: true, alreadySent: false });
  } catch {
    await admin.from('tournaments').update({
      creator_announcement_pending_at: null,
      creator_announcement_error: 'Discord-Ankündigung konnte nicht zugestellt werden.',
    }).eq('id', tournament.id);
    return NextResponse.json({ error: 'Discord-Ankündigung konnte nicht zugestellt werden.' }, { status: 502 });
  }
}

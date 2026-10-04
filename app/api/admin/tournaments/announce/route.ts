import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TournamentAnnouncement = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  registration_closes_at: string;
  max_players: number;
  best_of: number;
  premium_only: boolean;
  scoring_platform: string;
  tournament_format: string;
  dart_mode: string;
  prize_title: string | null;
  prize_details: string | null;
  status: string;
  discord_announcement_sent_at: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  }).format(new Date(value));
}

function labelForPlatform(value: string) {
  return value === 'scolia' ? 'Scolia' : value === 'dartcounter' ? 'DartCounter' : value;
}

function labelForFormat(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelForDartMode(value: string) {
  return value === 'double_in_double_out' ? 'Double In · Double Out' : 'Single In · Double Out';
}

function trimField(value: string, maxLength: number) {
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: actor, error: actorError } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('supabaseId', user.id)
    .maybeSingle();

  if (actorError) return NextResponse.json({ error: 'Berechtigung konnte nicht geprüft werden.' }, { status: 500 });
  if (!actor?.is_admin) return NextResponse.json({ error: 'Keine Admin-Berechtigung.' }, { status: 403 });

  let body: { tournamentId?: string; force?: boolean };
  try {
    body = await request.json() as { tournamentId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  if (!body.tournamentId || !/^[0-9a-f-]{36}$/i.test(body.tournamentId)) {
    return NextResponse.json({ error: 'Turnier-ID fehlt oder ist ungültig.' }, { status: 400 });
  }

  const webhookUrl = process.env.DISCORD_TOURNAMENT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json({
      error: 'Discord ist noch nicht verbunden. Hinterlege DISCORD_TOURNAMENT_WEBHOOK_URL in Vercel.',
      code: 'DISCORD_WEBHOOK_NOT_CONFIGURED',
    }, { status: 503 });
  }

  const { data: tournament, error: tournamentError } = await admin
    .from('tournaments')
    .select('id, title, description, starts_at, registration_closes_at, max_players, best_of, premium_only, scoring_platform, tournament_format, dart_mode, prize_title, prize_details, status, discord_announcement_sent_at')
    .eq('id', body.tournamentId)
    .maybeSingle<TournamentAnnouncement>();

  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 500 });
  if (!tournament) return NextResponse.json({ error: 'Turnier wurde nicht gefunden.' }, { status: 404 });
  if (tournament.status === 'cancelled') return NextResponse.json({ error: 'Abgesagte Turniere werden nicht angekündigt.' }, { status: 409 });
  if (tournament.discord_announcement_sent_at && !body.force) {
    return NextResponse.json({ announced: true, alreadySent: true, sentAt: tournament.discord_announcement_sent_at });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rankeddarts.de').replace(/\/$/, '');
  const tournamentUrl = `${siteUrl}/tournaments/${tournament.id}`;
  const prize = tournament.prize_title || tournament.prize_details || 'Wöchentliche Preise – siehe Turnierseite';
  const description = trimField(tournament.description || 'Die Anmeldung ist jetzt geöffnet. Sichere dir deinen Platz und sei beim Turnier dabei.', 900);

  const payload = {
    username: 'RankedDarts',
    avatar_url: `${siteUrl}/icon`,
    content: '@everyone',
    allowed_mentions: { parse: ['everyone'] },
    embeds: [{
      title: `🏆 ${trimField(tournament.title, 240)}`,
      url: tournamentUrl,
      description,
      color: 0xf5b942,
      fields: [
        { name: '🗓️ Turnierstart', value: formatDate(tournament.starts_at), inline: true },
        { name: '⏳ Anmeldung bis', value: formatDate(tournament.registration_closes_at), inline: true },
        { name: '🎯 Plattform', value: labelForPlatform(tournament.scoring_platform), inline: true },
        { name: '📋 Format', value: `${labelForFormat(tournament.tournament_format)} · Best of ${tournament.best_of}`, inline: true },
        { name: '🎲 Spielmodus', value: labelForDartMode(tournament.dart_mode), inline: true },
        { name: '👥 Plätze', value: `${tournament.max_players} Teilnehmer`, inline: true },
        { name: '💰 Preise', value: trimField(prize, 1024), inline: false },
      ],
      footer: { text: 'RankedDarts · Jetzt anmelden' },
      timestamp: new Date().toISOString(),
    }],
    components: [],
  };

  let webhookResponse: Response;
  try {
    const url = new URL(webhookUrl);
    url.searchParams.set('wait', 'true');
    webhookResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch (error) {
    await admin.from('tournaments').update({ discord_announcement_error: error instanceof Error ? error.message : 'Webhook-Anfrage fehlgeschlagen.' }).eq('id', tournament.id);
    return NextResponse.json({ error: 'Discord konnte nicht erreicht werden.' }, { status: 502 });
  }

  if (!webhookResponse.ok) {
    const responseText = await webhookResponse.text().catch(() => '');
    const safeError = `Discord antwortete mit HTTP ${webhookResponse.status}.`;
    await admin.from('tournaments').update({ discord_announcement_error: safeError }).eq('id', tournament.id);
    console.error('Discord tournament announcement failed:', webhookResponse.status, responseText.slice(0, 500));
    return NextResponse.json({ error: 'Discord hat die Ankündigung abgelehnt.' }, { status: 502 });
  }

  const discordMessage = await webhookResponse.json().catch(() => null) as { id?: string } | null;
  const sentAt = new Date().toISOString();
  const { error: updateError } = await admin.from('tournaments').update({
    discord_announcement_sent_at: sentAt,
    discord_announcement_message_id: discordMessage?.id || null,
    discord_announcement_error: null,
  }).eq('id', tournament.id);

  if (updateError) console.error('Discord announcement was sent but could not be recorded:', updateError.message);
  return NextResponse.json({ announced: true, alreadySent: false, sentAt, messageId: discordMessage?.id || null });
}

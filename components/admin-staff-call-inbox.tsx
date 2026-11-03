'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, ExternalLink, Loader2, RefreshCw, UsersRound } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type StaffCall = {
  id: string;
  match_id: string;
  requester_username: string;
  player1_username: string;
  player2_username: string;
  match_status: string;
  requested_at: string;
  notified_staff_count: number;
};

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'gerade eben';
  if (seconds < 3_600) return `vor ${Math.floor(seconds / 60)} Min.`;
  return `vor ${Math.floor(seconds / 3_600)} Std.`;
}

export function AdminStaffCallInbox() {
  const supabase = useMemo(() => createClient(), []);
  const [calls, setCalls] = useState<StaffCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCalls = useCallback(async () => {
    setLoading(true);
    const { data, error: requestError } = await supabase.rpc('admin_list_matchroom_staff_calls', { p_limit: 12 });
    if (requestError) {
      setError(`Team-Rufe konnten nicht geladen werden: ${requestError.message}`);
    } else {
      setCalls((data ?? []) as StaffCall[]);
      setError('');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadCalls();
    const interval = window.setInterval(() => void loadCalls(), 30_000);
    return () => window.clearInterval(interval);
  }, [loadCalls]);

  return (
    <section className="admin-staff-call-inbox" aria-label="Aktuelle Team-Rufe aus Matchrooms">
      <header>
        <div>
          <p><BellRing className="h-3.5 w-3.5" /> Live-Eingang</p>
          <h4>Team-Rufe aus Matchrooms</h4>
        </div>
        <button type="button" onClick={() => void loadCalls()} disabled={loading} title="Team-Rufe aktualisieren"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
      </header>

      {error ? <p className="admin-staff-call-inbox-message" role="status">{error}</p> : null}
      <div className="admin-staff-call-inbox-list">
        {loading ? <div className="admin-staff-call-inbox-empty"><Loader2 className="h-4 w-4 animate-spin" />Eingang wird geladen …</div> : calls.length ? calls.map((call) => (
          <article key={call.id}>
            <span className="admin-staff-call-inbox-signal"><BellRing className="h-4 w-4" /></span>
            <div className="min-w-0">
              <p><strong>{call.requester_username}</strong> braucht Unterstützung</p>
              <small>{call.player1_username} <b>vs</b> {call.player2_username} · {relativeTime(call.requested_at)}</small>
            </div>
            <div className="admin-staff-call-inbox-meta"><span>{call.match_status === 'disputed' ? 'Dispute' : call.match_status === 'awaiting_confirmation' ? 'Bestätigung' : 'Match läuft'}</span><small>{call.notified_staff_count} benachrichtigt</small></div>
            <a href={`/result?matchId=${call.match_id}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Öffnen</a>
          </article>
        )) : <div className="admin-staff-call-inbox-empty"><UsersRound className="h-4 w-4" />Keine offenen Team-Rufe.</div>}
      </div>
    </section>
  );
}

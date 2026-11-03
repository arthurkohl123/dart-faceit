'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pin, PinOff, Plus, RefreshCw, StickyNote } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type ShiftHandoff = {
  id: string;
  body: string;
  is_pinned: boolean;
  status: 'open' | 'resolved';
  created_at: string;
  created_by_username: string;
  resolved_at: string | null;
  resolved_by_username: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AdminShiftHandoffPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [handoffs, setHandoffs] = useState<ShiftHandoff[]>([]);
  const [draft, setDraft] = useState('');
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const loadHandoffs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_shift_handoffs', { p_status: 'open' });
    if (error) {
      setMessage(`Schichtnotizen konnten nicht geladen werden: ${error.message}`);
    } else {
      setHandoffs((data ?? []) as ShiftHandoff[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadHandoffs();
  }, [loadHandoffs]);

  const createHandoff = async () => {
    const body = draft.trim();
    if (body.length < 3) {
      setMessage('Schreibe mindestens drei Zeichen in die Schichtnotiz.');
      return;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('admin_create_shift_handoff', {
      p_body: body,
      p_is_pinned: pinned,
    });
    if (error) {
      setMessage(`Schichtnotiz konnte nicht gespeichert werden: ${error.message}`);
    } else {
      setDraft('');
      setPinned(false);
      setMessage('Schichtnotiz ist für das Admin-Team gespeichert.');
      await loadHandoffs();
    }
    setSaving(false);
  };

  const updateHandoff = async (handoff: ShiftHandoff, status?: ShiftHandoff['status'], isPinned?: boolean) => {
    setUpdatingId(handoff.id);
    setMessage('');
    const { error } = await supabase.rpc('admin_update_shift_handoff', {
      p_handoff_id: handoff.id,
      p_status: status ?? null,
      p_is_pinned: typeof isPinned === 'boolean' ? isPinned : null,
    });
    if (error) {
      setMessage(`Schichtnotiz konnte nicht aktualisiert werden: ${error.message}`);
    } else {
      setMessage(status === 'resolved' ? 'Punkt als erledigt markiert.' : isPinned ? 'Notiz oben angeheftet.' : 'Notiz nicht mehr angeheftet.');
      await loadHandoffs();
    }
    setUpdatingId(null);
  };

  return (
    <section className="admin-shift-handoff" aria-label="Schichtübergabe">
      <header>
        <div>
          <p><StickyNote className="h-3.5 w-3.5" /> Team-Übergabe</p>
          <h4>Was die nächste Schicht wissen muss</h4>
        </div>
        <button type="button" onClick={() => void loadHandoffs()} disabled={loading} title="Schichtnotizen aktualisieren"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
      </header>

      <div className="admin-shift-handoff-compose">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1500}
          placeholder="Zum Beispiel: Turnier X braucht nach dem Halbfinale noch eine Prüfung."
          aria-label="Neue Schichtnotiz"
        />
        <div>
          <button type="button" className={`admin-shift-handoff-pin ${pinned ? 'is-active' : ''}`} onClick={() => setPinned((current) => !current)}><Pin className="h-3.5 w-3.5" />{pinned ? 'Oben anheften' : 'Anheften'}</button>
          <button type="button" className="admin-shift-handoff-save" onClick={() => void createHandoff()} disabled={saving || draft.trim().length < 3}><Plus className="h-3.5 w-3.5" />{saving ? 'Speichert …' : 'Notiz speichern'}</button>
        </div>
      </div>

      {message ? <p className="admin-shift-handoff-message" role="status">{message}</p> : null}

      <div className="admin-shift-handoff-list">
        {loading ? <div className="admin-shift-handoff-empty"><Loader2 className="h-4 w-4 animate-spin" />Notizen werden geladen …</div> : handoffs.length ? handoffs.map((handoff) => {
          const updating = updatingId === handoff.id;
          return <article key={handoff.id} className={handoff.is_pinned ? 'is-pinned' : ''}>
            <span className="admin-shift-handoff-marker">{handoff.is_pinned ? <Pin className="h-3.5 w-3.5" /> : <StickyNote className="h-3.5 w-3.5" />}</span>
            <div className="min-w-0"><p>{handoff.body}</p><small>{handoff.created_by_username} · {formatTime(handoff.created_at)}</small></div>
            <div className="admin-shift-handoff-actions">
              <button type="button" onClick={() => void updateHandoff(handoff, undefined, !handoff.is_pinned)} disabled={updating} title={handoff.is_pinned ? 'Nicht mehr anheften' : 'Oben anheften'}>{handoff.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>
              <button type="button" onClick={() => void updateHandoff(handoff, 'resolved')} disabled={updating} title="Als erledigt markieren"><Check className="h-3.5 w-3.5" /></button>
            </div>
          </article>;
        }) : <div className="admin-shift-handoff-empty"><Check className="h-4 w-4" />Keine Übergabepunkte offen.</div>}
      </div>
    </section>
  );
}

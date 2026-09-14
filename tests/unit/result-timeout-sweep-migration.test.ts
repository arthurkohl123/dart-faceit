import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260914060000_auto_finalize_expired_match_results.sql'),
  'utf8',
);

test('expired result confirmations are finalized server-side without a browser', () => {
  assert.match(migration, /create or replace function public\.finalize_expired_match_confirmations\(\)/i);
  assert.match(migration, /status = 'awaiting_confirmation'/i);
  assert.match(migration, /confirmation_requested_at <= now\(\) - interval '5 minutes'/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /finalize_ranked_match_result\(v_match_id, null, 'server_timeout'\)/i);
});

test('result timeout sweep runs once per minute and can be safely reapplied', () => {
  assert.match(migration, /cron\.unschedule\(v_job_id\)/i);
  assert.match(migration, /'finalize-expired-match-results'/i);
  assert.match(migration, /'\* \* \* \* \*'/);
});

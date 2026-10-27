import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../deploy/supabase/migrate-storage.mjs', import.meta.url), 'utf8');

test('the self-hosted transition copies storage objects with server-only credentials', () => {
  assert.match(migration, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(migration, /SERVICE_ROLE_KEY/);
  assert.match(migration, /persistSession: false/);
  assert.match(migration, /listFiles\(client, bucketName, prefix/);
  assert.match(migration, /upsert: true/);
  assert.doesNotMatch(migration, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const privacyPage = readFileSync(new URL('../../app/datenschutz/page.tsx', import.meta.url), 'utf8');

test('the privacy policy reflects the VPS migration and transactional email provider', () => {
  assert.match(privacyPage, /Webtropia/);
  assert.match(privacyPage, /Resend/);
  assert.match(privacyPage, /selbst auf diesem Server/);
  assert.doesNotMatch(privacyPage, /<strong>Vercel<\/strong> hostet/);
  assert.doesNotMatch(privacyPage, /<strong>Supabase<\/strong> stellt/);
});

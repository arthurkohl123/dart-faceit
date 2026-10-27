import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const compose = readFileSync(new URL('../../docker-compose.production.yml', import.meta.url), 'utf8');
const caddyfile = readFileSync(new URL('../../deploy/vps/Caddyfile', import.meta.url), 'utf8');
const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');
const healthRoute = readFileSync(new URL('../../app/api/health/route.ts', import.meta.url), 'utf8');
const discordTimer = readFileSync(new URL('../../deploy/vps/rankeddarts-discord-sync.timer', import.meta.url), 'utf8');
const discordService = readFileSync(new URL('../../deploy/vps/rankeddarts-discord-sync.service', import.meta.url), 'utf8');

test('the VPS deployment uses the traced standalone server behind a reverse proxy', () => {
  assert.match(nextConfig, /output: 'standalone'/);
  assert.match(dockerfile, /node:22-alpine/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(dockerfile, /\.next\/static/);
  assert.match(compose, /caddy:2\.10\.2-alpine/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /host\.docker\.internal:host-gateway/);
  assert.match(caddyfile, /reverse_proxy app:3000/);
  assert.match(caddyfile, /api\.rankeddarts\.de/);
  assert.match(caddyfile, /reverse_proxy host\.docker\.internal:8000/);
});

test('the VPS keeps the daily Discord reconciliation and reports its own release health', () => {
  assert.match(discordTimer, /OnCalendar=\*-\*-\* 03:00:00/);
  assert.match(discordService, /api\/discord\/sync/);
  assert.match(discordService, /CRON_SECRET/);
  assert.match(healthRoute, /DEPLOYMENT_PLATFORM/);
  assert.match(healthRoute, /APP_RELEASE_SHA/);
});

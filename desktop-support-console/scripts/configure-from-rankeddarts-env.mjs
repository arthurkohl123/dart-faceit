import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(currentDir, '../..');
const candidates = ['.env.local', '.env'].map((name) => path.join(projectDir, name));
const source = candidates.find((candidate) => fs.existsSync(candidate));
let supabaseUrl;
let supabasePublishableKey;

if (source) {
  const values = Object.fromEntries(fs.readFileSync(source, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const divider = line.indexOf('=');
      return [line.slice(0, divider).trim(), line.slice(divider + 1).trim().replace(/^['"]|['"]$/g, '')];
    }));
  supabaseUrl = values.NEXT_PUBLIC_SUPABASE_URL;
  supabasePublishableKey = values.NEXT_PUBLIC_SUPABASE_ANON_KEY || values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
} else {
  const production = 'https://www.rankeddarts.de';
  const html = await (await fetch(production)).text();
  const scriptPaths = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => new URL(match[1], production).href);
  const scripts = await Promise.all(scriptPaths.map(async (url) => (await fetch(url)).text().catch(() => '')));
  const bundle = scripts.join('\n');
  const urlMatch = bundle.match(/https:\/\/[-a-z0-9]+\.supabase\.co/i);
  const clientMatch = bundle.match(/(?:createBrowserClient|createClient)\(["']https:\/\/[-a-z0-9]+\.supabase\.co["'],["']([^"']+)["']/i);
  const jwtMatch = bundle.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
  const publishableMatch = bundle.match(/sb_publishable_[a-zA-Z0-9_-]+/);
  supabaseUrl = urlMatch?.[0];
  supabasePublishableKey = clientMatch?.[1] || publishableMatch?.[0] || jwtMatch?.[0];
}

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Die öffentliche Supabase-Verbindung konnte nicht ermittelt werden. Lege src/runtime-config.js nach der Vorlage manuell an.');
}

const output = path.join(projectDir, 'desktop-support-console/src/runtime-config.js');
fs.writeFileSync(output, `// Automatically generated locally. Never commit credentials from this file.\nwindow.RANKEDDARTS_SUPPORT_CONFIG = ${JSON.stringify({ supabaseUrl, supabasePublishableKey }, null, 2)};\n`);
console.log('Die lokale Support-Console-Konfiguration wurde erstellt.');

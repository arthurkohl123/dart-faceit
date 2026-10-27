# RankedDarts production runbook

## Deployment order

1. Run all pending files in `supabase/migrations` in filename order.
2. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build`.
3. Merge into `main`, then deploy the VPS release with `./deploy/vps/deploy.sh` from `/opt/rankeddarts`.
4. Verify `https://www.rankeddarts.de/api/health`, then test login, matchmaking, result confirmation and Stripe checkout.

Never deploy application code that calls a new RPC before the matching migration has completed.

## Incident response

- Queue incident: disable matchmaking in `/developer`, preserve existing matches and inspect monitoring events.
- Stripe incident: do not grant Premium from a successful redirect alone. Inspect `stripe_webhook_events`, fix the cause and replay the signed event from Stripe Workbench.
- Result incident: disable matchmaking, inspect `active_matches`, `match_audit_log` and both `matches` history rows. Do not edit Elo before recording the original values.
- Database incident: put the site into maintenance mode and restore into a separate Supabase project first. Validate row counts and critical RPCs before switching production configuration.

## Backups

- Keep Supabase automated backups enabled. If Point-in-Time Recovery is available for the project plan, enable it.
- Keep automated VPS snapshots or backups enabled in the Webtropia customer panel. A VPS snapshot protects the Caddy configuration, deployment setup and recovery time; it is not a replacement for Supabase database backups.
- Before a season reset or destructive migration, create a database backup and export the affected rows.
- Once per quarter, restore the newest backup into a temporary project and run the public and authenticated smoke tests.
- Keep Stripe as the source of truth for subscriptions; webhook events can be replayed after a database restore.

## Required alerts

- Configure `MONITORING_ALERT_WEBHOOK_URL` as a GitHub Actions repository secret when immediate Discord or Slack outage alerts are wanted.
- Keep the scheduled `Production monitoring` workflow enabled.
- Treat checkout/webhook failures, database health failures, cancellation spikes and repeated-opponent integrity flags as actionable.

## Credential inventory

Store the **values** only in the team's password manager and in `/opt/rankeddarts/.env.production` with restricted permissions. Never place a value in Git, a support ticket, a chat or this document.

| Provider | Entries to keep recoverable | Rotate when |
| --- | --- | --- |
| Supabase | Project URL, publishable/anon key, service-role key | A service-role key is exposed or a privileged integration changes |
| Stripe | Secret key, webhook secret, Premium price IDs | A key is exposed, an endpoint changes or a team member loses access |
| Discord | Client ID, client secret, bot token, guild and managed-role IDs, OAuth state secret | Bot token/client secret is exposed, bot ownership changes or OAuth is reconfigured |
| Twitch | Client ID and client secret | Secret is exposed or the streamer integration is reconfigured |
| Cloudflare Turnstile | Site key and secret key | Secret is exposed or the domain changes |
| VPS | `CRON_SECRET`, SSH deploy key fingerprint, Caddy notification email | A server user changes, a key is exposed or a deploy integration changes |
| Monitoring | Alert webhook URL | The receiving channel changes or the URL is exposed |

After any rotation, update the server environment, recreate the app container, verify `/api/health` and test the affected integration. Keep Vercel out of the active credential path once the VPS is stable; do not delete it without an explicit approval and a verified rollback plan.

## Admin recovery

Admin and Developer routes require TOTP MFA. If the authenticator is lost, remove the affected factor from Supabase Authentication only after verifying the account owner through a separate channel.

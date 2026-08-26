# RankedDarts production runbook

## Deployment order

1. Run all pending files in `supabase/migrations` in filename order.
2. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build`.
3. Deploy a Vercel preview and run `npm run test:e2e` against its URL.
4. Merge into `main`, verify `/api/health`, then test login, matchmaking, result confirmation and Stripe portal.

Never deploy application code that calls a new RPC before the matching migration has completed.

## Incident response

- Queue incident: disable matchmaking in `/developer`, preserve existing matches and inspect monitoring events.
- Stripe incident: do not grant Premium from a successful redirect alone. Inspect `stripe_webhook_events`, fix the cause and replay the signed event from Stripe Workbench.
- Result incident: disable matchmaking, inspect `active_matches`, `match_audit_log` and both `matches` history rows. Do not edit Elo before recording the original values.
- Database incident: put the site into maintenance mode and restore into a separate Supabase project first. Validate row counts and critical RPCs before switching production configuration.

## Backups

- Keep Supabase automated backups enabled. If Point-in-Time Recovery is available for the project plan, enable it.
- Before a season reset or destructive migration, create a database backup and export the affected rows.
- Once per quarter, restore the newest backup into a temporary project and run the public and authenticated smoke tests.
- Keep Stripe as the source of truth for subscriptions; webhook events can be replayed after a database restore.

## Required alerts

- Configure `MONITORING_ALERT_WEBHOOK_URL` in Vercel and as a GitHub Actions repository secret.
- Keep the scheduled `Production monitoring` workflow enabled.
- Treat checkout/webhook failures, database health failures, cancellation spikes and repeated-opponent integrity flags as actionable.

## Admin recovery

Admin and Developer routes require TOTP MFA. If the authenticator is lost, remove the affected factor from Supabase Authentication only after verifying the account owner through a separate channel.

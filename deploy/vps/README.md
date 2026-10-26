# RankedDarts VPS cutover

This setup moves the Next.js application from Vercel to one Docker container behind Caddy. Supabase, Stripe, Discord, Twitch and Turnstile remain managed services; their credentials stay in `/opt/rankeddarts/.env.production` and never enter Git.

## Prepare while Vercel remains live

1. Use Ubuntu 24.04 LTS and set the server timezone to `Europe/Berlin`.
2. Install Docker Engine plus the Docker Compose plugin, enable automatic security updates, create a non-root deployment user and allow only SSH, HTTP and HTTPS through the firewall.
3. Clone this repository to `/opt/rankeddarts` and create `/opt/rankeddarts/.env.production` by copying the variable names from `.env.example`. Copy the **values** from Vercel manually; do not copy an environment file into Git or chat.
4. Set `CADDY_EMAIL` in `.env.production` to the email address that should receive TLS renewal notices. Keep `NEXT_PUBLIC_APP_URL`, `DISCORD_REDIRECT_URI`, Stripe webhook URLs and Twitch/Discord settings on `https://www.rankeddarts.de`.
5. Run `chmod 700 deploy/vps/deploy.sh` and `./deploy/vps/deploy.sh`. Before DNS is changed, test the container locally with `docker compose -f docker-compose.production.yml exec app node -e "fetch('http://127.0.0.1:3000/api/health').then(r => r.text()).then(console.log)"`.
6. Install the daily Discord timer:

   ```sh
   sudo cp deploy/vps/rankeddarts-discord-sync.service /etc/systemd/system/
   sudo cp deploy/vps/rankeddarts-discord-sync.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now rankeddarts-discord-sync.timer
   systemctl list-timers rankeddarts-discord-sync.timer
   ```

## Cutover window

1. Lower the DNS TTL to 300 seconds several hours beforehand.
2. Check `docker compose -f docker-compose.production.yml ps`, `/api/health`, login, queue search, a match result, Stripe checkout and Discord linking on the VPS first.
3. Point both `rankeddarts.de` and `www.rankeddarts.de` to the VPS. Caddy obtains and renews TLS automatically once DNS reaches the server.
4. Leave Vercel running as rollback for 24–48 hours. If a problem occurs, restore the previous DNS target; Supabase data is shared, so no database rollback is needed.
5. Only after monitoring the VPS successfully should Vercel be paused or removed.

## Release routine

For each release run `./deploy/vps/deploy.sh`, then inspect the status with:

```sh
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=100 app
curl -fsS https://www.rankeddarts.de/api/health
```

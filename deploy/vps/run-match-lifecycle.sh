#!/usr/bin/env sh
set -eu

cd /opt/rankeddarts

exec /usr/bin/docker compose -f /opt/rankeddarts/docker-compose.production.yml exec -T app node -e "const secret=process.env.CRON_SECRET;if(!secret)process.exit(1);fetch('http://127.0.0.1:3000/api/internal/match-lifecycle',{headers:{Authorization:'Bearer '+secret}}).then(async response=>{console.log(await response.text());process.exit(response.ok?0:1)}).catch(error=>{console.error(error);process.exit(1)})"

#!/usr/bin/env sh
set -eu

cd /opt/rankeddarts
git pull --ff-only origin main

export APP_RELEASE_SHA="$(git rev-parse --short HEAD)"
export DEPLOYMENT_VERSION="$APP_RELEASE_SHA"

docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --remove-orphans
docker compose --env-file .env.production -f docker-compose.production.yml ps

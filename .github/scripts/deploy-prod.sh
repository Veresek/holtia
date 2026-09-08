#!/usr/bin/env bash
# Recreates the production stack in the current directory. Secrets stay in .env;
# this script does not print them.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
CLIENT_DIR="${CLIENT_DIR:-client}"
DIST_INDEX="${CLIENT_DIR}/dist/index.html"

if [[ ! -f .env ]]; then
  echo "Missing .env in $(pwd). Copy .env.example and fill production values." >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE in $(pwd)." >&2
  exit 1
fi

if [[ ! -f "${CLIENT_DIR}/package-lock.json" ]]; then
  echo "Missing ${CLIENT_DIR}/package-lock.json in $(pwd)." >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

mkdir -p backups
if compose exec -T db pg_isready -U trium -d trium >/dev/null 2>&1; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dump="backups/trium-${stamp}.sql.gz"
  echo "Backing up postgres to ${dump}"
  compose exec -T db pg_dump -U trium trium | gzip >"$dump"
  shopt -s nullglob
  dumps=(backups/trium-*.sql.gz)
  if ((${#dumps[@]} > 10)); then
    printf '%s\n' "${dumps[@]}" | sort -r | tail -n +11 | xargs rm -f --
  fi
  shopt -u nullglob
else
  echo "Postgres is not running yet; skipping backup"
fi

compose up --build -d --remove-orphans

wait_for() {
  local name="$1"
  shift
  local i
  for i in $(seq 1 40); do
    if "$@" >/dev/null 2>&1; then
      echo "${name} is healthy"
      return 0
    fi
    sleep 3
  done
  echo "${name} did not become healthy" >&2
  compose ps >&2
  return 1
}

wait_for "API" compose exec -T server python -c \
  "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health', timeout=3)"
wait_for "API on 127.0.0.1:8001" curl -fsS http://127.0.0.1:8001/api/health

echo "Building SPA into ${CLIENT_DIR}/dist"
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$(pwd)/${CLIENT_DIR}:/app" \
  -w /app \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/npm-cache \
  node:24-alpine \
  sh -c "npm ci && npm run build"

if [[ ! -f "$DIST_INDEX" ]]; then
  echo "${DIST_INDEX} was not produced" >&2
  ls -la "${CLIENT_DIR}/dist" >&2 || true
  exit 1
fi
echo "SPA ready at ${DIST_INDEX}"

domain="$(grep -E '^DOMAIN=' .env | head -n1 | cut -d= -f2- | tr -d '[:space:]\r' | tr -d "\"'")"
if [[ -n "$domain" ]] && command -v curl >/dev/null 2>&1; then
  if curl -fsS "https://${domain}/api/health" >/dev/null 2>&1; then
    echo "https://${domain}/api/health is healthy"
  else
    echo "https://${domain}/api/health is not reachable yet." >&2
    echo "Serve ${DIST_INDEX} and proxy /api to 127.0.0.1:8001 on the host reverse proxy." >&2
  fi
fi

compose ps
docker image prune -f >/dev/null
echo "Deploy finished at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

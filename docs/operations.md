# Operations

Private-instance runbook. Product decisions stay in [product.md](product.md).
Do not treat this box as a public signup host until verify/reset use per-user
email tokens. See [review.md](review.md).

## Deploy

Create `.env` from `.env.example` and replace every production placeholder.
Required for `docker-compose.prod.yml`:

| Variable | Notes |
|----------|--------|
| `DOMAIN` | DNS must already point at the VPS |
| `INSTANCE_CODE` | Operator secret. Anyone with the code and an email can reset that password. |
| `SECRET_KEY` | ≥32 characters, not a known default |
| `POSTGRES_PASSWORD` | Alphanumeric so it is safe inside `DATABASE_URL` |

Optional AI (off until you set both):

| Variable | Notes |
|----------|--------|
| `AI_ENABLED` | `true` to turn the assistant on |
| `AI_ENCRYPTION_KEY` | **Required when AI is enabled.** 32 bytes as standard base64 or 64 hex characters |

Point DNS at the VPS. Port 80/443 stay on the host reverse proxy already
running there. Compose does not bind them.

```bash
bash .github/scripts/deploy-prod.sh
```

The script migrates before the API starts, publishes FastAPI on
`127.0.0.1:8001`, and builds the SPA to `client/dist/index.html`. Postgres
stays on the internal Docker network. Point the host reverse proxy at that
`dist/` directory and proxy `/api` to `127.0.0.1:8001` (Caddy example below).
After the first boot, GitHub Actions CD (below) runs the same script on every
green CI run on `main`.

Health:

- App: `https://$DOMAIN/` (host reverse proxy → `client/dist`)
- API: `https://$DOMAIN/api/health` (host reverse proxy → `127.0.0.1:8001`)
- Container healthcheck hits `/api/health` inside the API container

Example Caddy site on the host (reload Caddy after the first `dist/` build):

```caddy
trium.example.com {
	header {
		Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}

	handle /api/* {
		reverse_proxy 127.0.0.1:8001
	}

	root * /opt/trium/client/dist

	@assets path /assets/*
	handle @assets {
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}

	handle {
		header Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
```

## Continuous deployment

`.github/workflows/cd.yml` deploys the commit that just passed CI on `main`.
It SSHs to the VPS, checks out that SHA, dumps Postgres, runs
`docker compose -f docker-compose.prod.yml up --build -d`, then builds the SPA
into `client/dist` with Node 24 in Docker. You can also run the workflow by
hand (Actions → CD → Run workflow) and pass a ref.

Secrets stay on the box in `.env`. The workflow never receives
`INSTANCE_CODE`, `SECRET_KEY`, or `AI_ENCRYPTION_KEY`.

### VPS bootstrap (once)

Ubuntu, Docker Compose v2, git, curl. Clone over HTTPS so pull needs no
GitHub credentials. Put the operator in the `docker` group so CD does not
need sudo.

```bash
sudo mkdir -p /opt/trium
sudo chown "$USER:$USER" /opt/trium
git clone https://github.com/Veresek/trium.git /opt/trium
cd /opt/trium
cp .env.example .env
# fill DOMAIN, INSTANCE_CODE, SECRET_KEY, POSTGRES_PASSWORD
bash .github/scripts/deploy-prod.sh
# add the Caddy site block above, then reload the host reverse proxy
```

Install a deploy-only SSH key. On the machine that will hold the private
half (or a throwaway local key you paste into GitHub, then delete):

```bash
ssh-keygen -t ed25519 -f trium-deploy -N "" -C "github-actions-cd"
```

Append `trium-deploy.pub` to `~/.ssh/authorized_keys` for the same user that
owns `/opt/trium`. Record the host keys GitHub must pin:

```bash
ssh-keyscan -t ed25519,rsa "$DOMAIN"
```

### GitHub environment `production`

Settings → Environments → New environment → `production`. Optional: required
reviewers so a push to `main` does not go live unattended.

Secrets:

| Secret | Value |
|--------|--------|
| `DEPLOY_HOST` | VPS hostname or IP |
| `DEPLOY_USER` | SSH user that owns `/opt/trium` and can run Docker |
| `DEPLOY_SSH_KEY` | Full private key (`-----BEGIN … PRIVATE KEY-----`) |
| `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan` for that host |

Variables (optional):

| Variable | Default | Notes |
|----------|---------|--------|
| `DEPLOY_PATH` | `/opt/trium` | Clone directory |
| `DEPLOY_PORT` | `22` | SSH port |

A deploy keeps the ten newest files under `backups/trium-*.sql.gz` on the
VPS. That is not off-box backup; copy dumps off the machine as well. The same
script is `.github/scripts/deploy-prod.sh` if you upgrade over SSH by hand.

## Backup

CD dumps Postgres into `backups/` before it recreates containers. Still copy
those files off the VPS, and back up the `postgres_data` volume before any
manual upgrade. That volume holds accounts, tasks, blocks, notes, sessions,
and encrypted AI keys.

Losing the database is losing the instance. Losing **only**
`AI_ENCRYPTION_KEY` while the database survives means stored provider keys
cannot be decrypted. Users must paste their API keys again. Trium cannot recover
them.

## `AI_ENCRYPTION_KEY`

Generate a 32-byte key (base64):

```powershell
python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
```

```bash
python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
```

Store it in `.env` next to `SECRET_KEY`. Keep a copy in whatever password
manager you use for the VPS. Production (and any environment with `AI_ENABLED`)
refuses to start without a valid key.

This secret is **not** the user’s provider key. It only wraps those
keys at rest. Do not log it, commit it, or reuse `SECRET_KEY` for it.

### Rotation

There is no re-encrypt job. To rotate:

1. Set `AI_ENABLED=false` or accept that the assistant will error until keys are
   saved again.
2. Replace `AI_ENCRYPTION_KEY` and recreate the API container.
3. Ask each user to paste their provider key on Account (Add API key).

If you change the key while rows still exist, `POST /api/ai/plan` returns
“The stored API key could not be read. Save it again.”

## Assistant behaviour

- Default is off. The bar shows “Coming later”.
- When enabled, users pick OpenAI, Anthropic, Google Gemini, DeepSeek, or xAI
  and paste a key.
- Prompts go to that provider from the API container (outbound HTTPS). The
  browser never sees the key and never calls the provider.
- Rate limit: `AI_RATE_LIMIT_REQUESTS` per user per
  `AI_RATE_LIMIT_WINDOW_SECONDS` (default 20 / hour). In-memory, per process.
- Do not enable access/error body logging for `/api/ai/*` on the reverse proxy or Uvicorn.

## Secrets checklist

Never commit `.env`. Do not publish `INSTANCE_CODE`. After a leaked
`SECRET_KEY`, rotate it and treat every session as compromised. After a leaked
`AI_ENCRYPTION_KEY`, rotate it and treat stored provider keys as readable by
whoever has a database dump from that window.

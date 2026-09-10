# Operations

Private-instance runbook. Product decisions stay in [product.md](product.md).
Do not treat this box as a public signup host until verify/reset use per-user
email tokens. See [review.md](review.md).

## Deploy

Create `.env` from `.env.example` and replace every production placeholder.
Required for `docker-compose.prod.yml`:

| Variable | Notes |
|----------|--------|
| `DOMAIN` | Public hostname (`holtia.xyz`). DNS must already point at the VPS |
| `INSTANCE_CODE` | Operator secret. Anyone with the code and an email can reset that password. |
| `SECRET_KEY` | ≥32 characters, not a known default |
| `POSTGRES_PASSWORD` | Alphanumeric so it is safe inside `DATABASE_URL` |

Optional AI (off until you set both):

| Variable | Notes |
|----------|--------|
| `AI_ENABLED` | `true` to turn the assistant on |
| `AI_ENCRYPTION_KEY` | **Required when AI is enabled.** 32 bytes as standard base64 or 64 hex characters |

Point DNS at the VPS. Port 80/443 stay on the host nginx. Compose does not
bind them.

Fill `.env`, add the nginx site below, then run GitHub Actions CD (or
Actions → CD → Run workflow). The workflow migrates before the API starts,
publishes FastAPI on `127.0.0.1:8001`, and builds the SPA to
`client/dist/index.html`. Postgres stays on the internal Docker network. Point
nginx `root` at that `dist/` directory and proxy `/api` to `127.0.0.1:8001`.

Health:

- App: `https://$DOMAIN/` (nginx → `client/dist`)
- API: `https://$DOMAIN/api/health` (nginx → `127.0.0.1:8001`)
- Container healthcheck hits `/api/health` inside the API container

Example nginx site (reload after the first `dist/` build). TLS paths are
yours — certbot or whatever you already use. Set `root` to the absolute
`$DEPLOY_PATH/client/dist`.

```nginx
server {
	listen 443 ssl http2;
	listen [::]:443 ssl http2;
	server_name holtia.xyz;

	# ssl_certificate     /path/to/fullchain.pem;
	# ssl_certificate_key /path/to/privkey.pem;

	root /opt/holtia/client/dist;
	index index.html;

	add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
	add_header X-Content-Type-Options nosniff always;
	add_header Referrer-Policy strict-origin-when-cross-origin always;

	location /api/ {
		proxy_pass http://127.0.0.1:8001;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}

	location /assets/ {
		expires 1y;
		try_files $uri =404;
	}

	location / {
		expires -1;
		try_files $uri $uri/ /index.html;
	}
}
```

## Continuous deployment

`.github/workflows/cd.yml` deploys the commit that just passed CI on `main`.
It SSHs to the VPS, checks out that SHA, dumps Postgres, runs
`docker compose -f docker-compose.prod.yml up --build -d`, then builds the SPA
into `client/dist` with Node 24 in Docker. You can also run the workflow by
hand (Actions → CD → Run workflow) and pass a ref. All of that lives in the
workflow file; there is no separate deploy script.

Secrets stay on the box in `.env`. The workflow never receives
`INSTANCE_CODE`, `SECRET_KEY`, or `AI_ENCRYPTION_KEY`.

### VPS bootstrap (once)

Ubuntu, Docker Compose v2, git, curl. Clone over HTTPS so pull needs no
GitHub credentials. Put the operator in the `docker` group so CD does not
need sudo.

```bash
sudo mkdir -p /opt/holtia
sudo chown "$USER:$USER" /opt/holtia
git clone https://github.com/Veresek/trium.git /opt/holtia
cd /opt/holtia
cp .env.example .env
# fill DOMAIN=holtia.xyz, INSTANCE_CODE, SECRET_KEY, POSTGRES_PASSWORD
# add the nginx site above, then reload nginx
```

Install a deploy-only SSH key. On the machine that will hold the private
half (or a throwaway local key you paste into GitHub, then delete):

```bash
ssh-keygen -t ed25519 -f holtia-deploy -N "" -C "github-actions-cd"
```

Append `holtia-deploy.pub` to `~/.ssh/authorized_keys` for the same user that
owns `/opt/holtia`. The first CD run accepts the host key (`accept-new`).

### GitHub Actions secrets

Settings → Secrets and variables → Actions → Repository secrets.

| Secret | Value |
|--------|--------|
| `DEPLOY_HOST` | VPS hostname or IP |
| `DEPLOY_USER` | SSH user that owns `/opt/holtia` and can run Docker |
| `DEPLOY_KEY` | Full private key (`-----BEGIN … PRIVATE KEY-----`) |

Optional repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Default | Notes |
|----------|---------|--------|
| `DEPLOY_PATH` | `~/holtia` | Clone directory |
| `DEPLOY_PORT` | `22` | SSH port |

A deploy keeps the ten newest files under `backups/holtia-*.sql.gz` on the
VPS. That is not off-box backup; copy dumps off the machine as well. To
upgrade by hand, run the CD workflow (Actions → CD → Run workflow).

## Backup

CD dumps Postgres into `backups/` before it recreates containers. Still copy
those files off the VPS, and back up the `postgres_data` volume before any
manual upgrade. That volume holds accounts, tasks, blocks, notes, sessions,
and encrypted AI keys.

Losing the database is losing the instance. Losing **only**
`AI_ENCRYPTION_KEY` while the database survives means stored provider keys
cannot be decrypted. Users must paste their API keys again. Holtia cannot recover
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
- Do not enable access/error body logging for `/api/ai/*` on nginx or Uvicorn.

## Secrets checklist

Never commit `.env`. Do not publish `INSTANCE_CODE`. After a leaked
`SECRET_KEY`, rotate it and treat every session as compromised. After a leaked
`AI_ENCRYPTION_KEY`, rotate it and treat stored provider keys as readable by
whoever has a database dump from that window.

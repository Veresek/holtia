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

Point DNS at the VPS and allow inbound TCP 80/443 and UDP 443.

```powershell
docker compose -f docker-compose.prod.yml up --build -d
```

Compose migrates before the API starts, serves the SPA through Caddy, and keeps
Postgres and FastAPI off the public network.

Health:

- App: `https://$DOMAIN/`
- API: `https://$DOMAIN/api/health`
- Container healthchecks hit `/api/health` and Caddy `/healthz`

## Backup

Back up the `postgres_data` volume before upgrades. That volume holds accounts,
tasks, blocks, notes, sessions, and encrypted AI keys.

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

This secret is **not** the user’s OpenAI/xAI/Gemini key. It only wraps those
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
- When enabled, users pick OpenAI, xAI, or Google Gemini and paste a key.
- Prompts go to that provider from the API container (outbound HTTPS). The
  browser never sees the key and never calls the provider.
- Rate limit: `AI_RATE_LIMIT_REQUESTS` per user per
  `AI_RATE_LIMIT_WINDOW_SECONDS` (default 20 / hour). In-memory, per process.
- Do not enable access/error body logging for `/api/ai/*` on Caddy or Uvicorn.

## Secrets checklist

Never commit `.env`. Do not publish `INSTANCE_CODE`. After a leaked
`SECRET_KEY`, rotate it and treat every session as compromised. After a leaked
`AI_ENCRYPTION_KEY`, rotate it and treat stored provider keys as readable by
whoever has a database dump from that window.

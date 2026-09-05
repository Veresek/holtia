# Trium

Command center for the day: tasks, time blocks, and notes in one place.

Open source ([GNU GPL v3](LICENSE)), self-hostable, one person at a time. UI in
English. Product decisions live in [`docs/product.md`](docs/product.md). How to
work in this repo is in [`AGENTS.md`](AGENTS.md).

## Status (5 September 2026)

The September MVP is feature-complete in code:

- Email/password accounts, HttpOnly cookie sessions, instance-code verification
  and password reset, logout, and account deletion.
- Tasks, calendar time blocks (including recurrence and overnight spans), and
  markdown notes, including pins from a task to a block occurrence and from a
  note to a block series.
- Home’s morning review: today’s open tasks, a window around now, and recent
  notes.
- Responsive web shell (sidebar on desktop, bottom tabs on the phone) with an
  AI bar. The assistant stays off until `AI_ENABLED`; users then bring their
  own OpenAI, xAI, or Gemini key.
- Docker Compose for development and for HTTPS production behind Caddy.

This instance is still a **private / trusted deployment**. The shared
`INSTANCE_CODE` is a temporary stand-in for email. Do not publish it: anyone
who has the code and an account email can reset that password. Public open
registration waits on per-user email codes. See
[`docs/review.md`](docs/review.md) and [`docs/operations.md`](docs/operations.md).

## Requirements

| Layer | Version |
|-------|---------|
| Python | 3.13 |
| Node | 24 |
| PostgreSQL | 18 |
| Docker Compose | v2 |
| CI | GitHub Actions: `ruff` + `pytest` on the server, lint / test / build on the client |

## Development with Docker

```powershell
Copy-Item .env.example .env
docker compose up --build
```

```bash
cp .env.example .env
docker compose up --build
```

- App: <http://localhost:5173>
- API health: <http://localhost:8000/api/health>
- OpenAPI: <http://localhost:8000/docs>

Compose starts Postgres, runs `scripts/migrate.py`, then the API and the Vite
dev server. Leave `INSTANCE_CODE` empty in `.env` so local accounts skip
verification.

## Run without Docker

Start PostgreSQL, copy `.env.example` to `.env`, and set `DATABASE_URL` plus
`CLIENT_ORIGIN`. From `server/`:

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements-dev.txt
.\.venv\Scripts\python scripts\migrate.py
.\.venv\Scripts\python -m uvicorn app.main:app --reload
```

```bash
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python scripts/migrate.py
.venv/bin/python -m uvicorn app.main:app --reload
```

In another terminal, from `client/`:

```powershell
npm ci
npm run dev
```

The Vite proxy forwards `/api` to `http://localhost:8000`. Override it with
`VITE_API_PROXY_TARGET`.

## Checks

From `server/`:

```powershell
.\.venv\Scripts\python -m ruff check .
.\.venv\Scripts\python -m pytest
```

From `client/`:

```powershell
npm run lint
npm test
npm run build
```

CI on every push and pull request runs the same jobs (Python 3.13, Node 24).
Revoked refresh-token rows can be cleaned with
`python scripts/purge_revoked_tokens.py` from `server/` — see
[`server/README.md`](server/README.md).

## Production HTTPS

Create `.env` from `.env.example` and replace every production placeholder.
`DOMAIN`, `INSTANCE_CODE`, `SECRET_KEY`, and `POSTGRES_PASSWORD` are required.
Production validation rejects an empty instance code or a weak secret key.
Treat `INSTANCE_CODE` as an operator secret, not a public invite.

Point DNS at the VPS and allow inbound TCP 80/443 and UDP 443.

```powershell
docker compose -f docker-compose.prod.yml up --build -d
```

The production stack migrates before the API starts, serves the built SPA
through Caddy, redirects to and renews HTTPS, and proxies `/api` on the same
origin. PostgreSQL and FastAPI have no public ports. Back up the
`postgres_data` volume before upgrades. Full runbook:
[`docs/operations.md`](docs/operations.md).

## Docs

| File | What it is |
|------|------------|
| [`docs/product.md`](docs/product.md) | Locked product decisions |
| [`docs/execution.md`](docs/execution.md) | MVP status, data, backlog |
| [`docs/operations.md`](docs/operations.md) | Deploy, backup, secrets |
| [`docs/review.md`](docs/review.md) | Current risks, prioritized |
| [`docs/ai-tools.md`](docs/ai-tools.md) | Assistant contract (preview, then REST creates) |
| [`AGENTS.md`](AGENTS.md) | Conventions for people and agents |

License: [GNU GPL v3](LICENSE).

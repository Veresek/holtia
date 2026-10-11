# Holtia

Command center for the day: tasks, time blocks, and notes in one place.

Open source ([GNU GPL v3](LICENSE)), self-hostable, one person at a time. UI in
English. Product decisions live in [`docs/product.md`](docs/product.md). How to
work in this repo is in [`AGENTS.md`](AGENTS.md).

## Status (11 October 2026)

The September MVP is feature-complete in code:

- Email/password accounts, HttpOnly cookie sessions, verification and password
  reset with a one-time code sent by email, logout, and account deletion.
- Tasks, calendar time blocks (including recurrence and overnight spans), and
  markdown notes, including pins from a task to a block occurrence, from a
  note to a block series, and from a note to a day.
- Home’s morning review: today’s open tasks, a window around now, and recent
  notes.
- Responsive web shell (sidebar on desktop, bottom tabs on the phone) with an
  assistant sheet. The assistant stays off until `AI_ENABLED`; users then bring their
  own OpenAI, Anthropic, Gemini, DeepSeek, or xAI key.
- Docker Compose for development and for production (API on localhost:8001,
  SPA built to `client/dist` for the host reverse proxy).

Verify and reset send a 6-digit code to the account’s own email address, so no
operator secret is shared between accounts. The instance is still **private**.
Open registration for strangers waits on the remaining blockers in
[`docs/roadmap-v2.md`](docs/roadmap-v2.md): a rate limiter shared across
processes, a server-side expiry on refresh tokens, and change email. See
[`docs/review.md`](docs/review.md) and [`docs/operations.md`](docs/operations.md).

## Requirements

| Layer | Version |
|-------|---------|
| Python | 3.13 |
| Node | 24 |
| PostgreSQL | 18 |
| Docker Compose | v2 |
| CI | GitHub Actions: `ruff` + `pytest` on the server, lint / test / build on the client |
| CD | GitHub Actions: on push to `main`, SSH to the VPS, Compose `--build`, SPA `dist/` |

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
dev server. This stack sets no SMTP variables, so local accounts skip
verification and work immediately. To exercise emailed codes locally, run the
API outside Docker with `SMTP_HOST` and the rest of the SMTP block in
`server/.env`.

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
A green CI run on `main` then deploys that commit to the VPS (see
[`docs/operations.md`](docs/operations.md)).
Revoked refresh-token rows can be cleaned with
`python scripts/purge_revoked_tokens.py` from `server/` — see
[`server/README.md`](server/README.md).

## Production

Create `.env` from `.env.example` and replace every production placeholder.
`DOMAIN`, `SECRET_KEY`, `POSTGRES_PASSWORD`, `SMTP_HOST`, `SMTP_USER`,
`SMTP_PASSWORD`, and `MAIL_FROM` are required. Production refuses to start
without a configured SMTP sender or with a weak secret key. Create the sending
mailbox first (this instance sends through Mailcow, e.g. `holtia@holtia.xyz`)
and set `SMTP_HOST` to the mail server’s canonical hostname, e.g.
`mail.holtia.xyz` — the API verifies its TLS certificate. Treat the mailbox
password as an operator secret.

Point `holtia.xyz` at the VPS. Port 80/443 stay on the host nginx. Compose
publishes the API on `127.0.0.1:8001` only.

Fill `.env` and run GitHub Actions CD. The workflow migrates before the API
starts, then builds the SPA to `client/dist/index.html`. Proxy `/api` to
`127.0.0.1:8001` and serve `dist/` from nginx on the same origin. After the
first boot, green CI on `main` deploys that commit over SSH.
Back up the `postgres_data` volume before upgrades. Full runbook:
[`docs/operations.md`](docs/operations.md).

## Docs

| File | What it is |
|------|------------|
| [`docs/product.md`](docs/product.md) | Locked product decisions |
| [`docs/execution.md`](docs/execution.md) | MVP status, data, backlog |
| [`docs/operations.md`](docs/operations.md) | Deploy, CD, backup, secrets |
| [`docs/review.md`](docs/review.md) | Current risks, prioritized |
| [`docs/ai-tools.md`](docs/ai-tools.md) | Assistant contract (preview, then REST creates) |
| [`docs/roadmap-v2.md`](docs/roadmap-v2.md) | v2: public registration, habits, AI, export |
| [`AGENTS.md`](AGENTS.md) | Conventions for people and agents |

License: [GNU GPL v3](LICENSE).

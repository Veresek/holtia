# Holtia server

FastAPI application that owns authentication and all user data.

Auth, Tasks, time blocks (including recurrence expansion on read), and Notes are
implemented. Sessions last until password reset, logout, or account deletion.
`PATCH /api/users/me` saves the account timezone; change email still returns
`501`. Auth rate limiting is
in-memory per process; a single API worker is assumed. The assistant
(`AI_ENABLED`) stores per-user provider keys encrypted with `AI_ENCRYPTION_KEY`.

Run from this directory after starting PostgreSQL and configuring
`DATABASE_URL`:

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

Health: <http://localhost:8000/api/health>
OpenAPI: <http://localhost:8000/docs>

Sessions use HttpOnly cookies (`access_token`, `refresh_token`), not JSON
bodies. Refresh tokens rotate on each `/api/auth/refresh`. Optional
`AUTH_RATE_LIMIT_*` settings are documented in `.env.example`.

```powershell
.\.venv\Scripts\python -m ruff check .
.\.venv\Scripts\python -m pytest
```

```bash
.venv/bin/python -m ruff check .
.venv/bin/python -m pytest
```

Revoked refresh-token rows left behind by rotation can be cleaned with
`python scripts/purge_revoked_tokens.py`. Active sessions are not touched.

## Migrations

The application never creates tables at runtime. Alembic reads
`Settings.database_url`, so configuration comes from `DATABASE_URL` or the
server `.env` file. Current head: `20260913_0012` (`users.timezone`).

```powershell
python scripts/migrate.py
alembic current
```

`scripts/migrate.py` handles three cases before starting Uvicorn in both Docker
stacks:

- an empty database receives the normal upgrade to `head`;
- the exact unversioned schema formerly produced by `create_all` is validated,
  stamped at `20260831_0001`, and upgraded (later columns such as
  `notes.time_block_id` arrive through Alembic, not that baseline);
- a partial or unknown unversioned schema fails without stamping.

Already versioned databases receive the normal Alembic upgrade. Tests
intentionally create and drop their isolated SQLite schema in
`tests/conftest.py`.

In production use `ENVIRONMENT=production`, an HTTPS `CLIENT_ORIGIN`, a
non-empty `INSTANCE_CODE`, and a unique `SECRET_KEY` of at least 32 characters.
The production Compose stack publishes this service on `127.0.0.1:8001`. The
host reverse proxy should expose it at `/api` on the same origin as the SPA.
Do not publish `INSTANCE_CODE`; see [`docs/operations.md`](../docs/operations.md).

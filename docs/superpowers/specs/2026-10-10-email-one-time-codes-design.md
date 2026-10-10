# Email one-time codes — design

Date: 2026-10-10
Status: approved by the maintainer; amended in-flight per ledger rulings on the execution branch
Replaces: the shared `INSTANCE_CODE` used by `POST /auth/verify` and `POST /auth/reset`
Implements: `docs/roadmap-v2.md` → “Public registration → SMTP and per-user tokens”

## Goal

Account verification and password reset stop using one shared operator
secret. Instead, each user receives a single-use 6-digit code by email,
sent through the Mailcow SMTP server that runs on the same VPS as Holtia.
After this change the API starts and runs with no `INSTANCE_CODE`.

## Scope

In scope:

- `EmailCode` model + Alembic migration.
- Email sending service (stdlib `smtplib`, no new dependencies).
- New endpoint `POST /auth/send-code`; `verify` and `reset` switch to codes.
- Full retirement of `INSTANCE_CODE` (settings, compose files, `.env.example`,
  docs, UI copy).
- Client: `VerifyPage` and `ResetPage` reworked for the code flow.
- Production config validation: SMTP settings required.

Out of scope (separate roadmap items, unchanged by this work):

- Shared (Postgres/Redis) rate limiter — the existing in-memory
  `enforce_auth_rate_limit` is reused on the new endpoints.
- Server-side `expires_at` on refresh tokens.
- Change email (`PATCH /api/users/me` stays 501 for `email`).
- Google login.

## Decisions (approved by the maintainer on 2026-10-10)

1. **Scope:** email codes only; the other “before public” items stay separate.
2. **Code format:** 6-digit numeric code typed into forms — not a magic link.
3. **Dev behavior:** unconfigured SMTP in development = accounts auto-verify
   at register and reset accepts any code (mirrors today’s empty
   `INSTANCE_CODE`). Production requires SMTP config or the API refuses to
   start.
4. **Sending approach:** stdlib `smtplib` + `email.message` in
   `server/app/services/email.py`, injected so tests use a fake sender.

## Data model

New table `email_codes` (SQLAlchemy 2 style, UUID PK, migration
`20261010_0015_email_codes.py`):

| column       | type                 | notes                                   |
|--------------|----------------------|------------------------------------------|
| `id`         | UUID PK              | `default=uuid.uuid4`                     |
| `user_id`    | UUID FK → users.id   | `ondelete="CASCADE"`, indexed            |
| `purpose`    | String(8)            | `"verify"` or `"reset"`                  |
| `code_hash`  | String(64)           | SHA-256 hex of the 6-digit code          |
| `attempts`   | Integer, default 0   | wrong-entry counter, server_default "0"  |
| `expires_at` | DateTime(timezone=True) | created_at + TTL                       |
| `consumed_at`| DateTime, nullable   | set atomically on successful use         |
| `created_at` | DateTime(timezone=True) | `server_default=func.now()`            |

Index on `(user_id, purpose)`. Model in `server/app/models/email_code.py`,
registered on `Base` like the others; `User` gains an `email_codes`
relationship with `cascade="all, delete-orphan"`.

Hygiene: creating a new code for a `(user_id, purpose)` deletes that pair’s
previous rows, so at most one candidate code exists per user and purpose.
No purge job is added; expired rows are inert and deleted on next request.

## Code lifecycle (service `server/app/services/email_codes.py`)

- **Generation:** `f"{secrets.randbelow(1_000_000):06d}"`. The raw code is
  returned to the caller once (for the email body) and never stored, logged,
  or included in any API response.
- **Hashing:** `hashlib.sha256(code.encode()).hexdigest()`, consistent with
  `hash_refresh_token` in `services/tokens.py`. A DB leak plus a 6-digit
  space is acceptable because TTL is short and attempts are capped.
- **TTL:** `email_code_ttl_minutes` (default 15).
- **Attempt cap:** `MAX_CODE_ATTEMPTS = 5`. A wrong entry increments
  `attempts`; reaching the cap marks the code consumed (burned) so brute
  force within the TTL is bounded to 5 tries per issued code, on top of the
  per-IP `enforce_auth_rate_limit` on the endpoints.
- **Atomic consumption:** the confirm step selects the live code
  (`user_id`, `purpose`, `consumed_at IS NULL`, `expires_at > now`) with
  `.with_for_update()`, compares hashes with `secrets.compare_digest`, then
  sets `consumed_at` in the same transaction. Two concurrent requests cannot
  both succeed (roadmap requirement).
- **Cooldown:** if the newest code for `(user_id, purpose)` was created less
  than `email_code_cooldown_seconds` ago (default 60), `send-code` skips
  generation and sending. The response stays identical (204) either way.

## Email service (`server/app/services/email.py`)

- Plain stdlib: `smtplib.SMTP(host, port, timeout=smtp_timeout_seconds)`,
  `starttls(context=ssl.create_default_context())`, `login(user, password)`,
  `send_message`. Message built with
  `email.message.EmailMessage`, plain-text body only, `From: mail_from`.
  (STARTTLS verifies the server certificate — amended 2026-10-10 per ledger
  Ruling 3 after a review found the bare call ships an unverified context.)
- Sending happens inline in the request handler after the DB commit. SMTP is
  local (same VPS), so latency is milliseconds; the timeout (default 10 s)
  bounds the worst case.
- **Failure handling:** an SMTP error is caught, logged *without the code*
  (email address and exception only), and the endpoint still returns its
  normal opaque response. Returning an error would reveal that the account
  exists (a nonexistent email never triggers a send). The user recovers via
  “Resend code” after the cooldown.
- Two templates, subject and body:
  - verify: “Your Holtia verification code” — code, expiry note.
  - reset: “Your Holtia password reset code” — code, expiry note, a line
    saying to ignore the email if this was not requested.
- The sender is a small injectable function/object so tests substitute a
  fake without network access.

## Configuration (`server/app/config.py`)

New `Settings` fields:

```
smtp_host: str = ""
smtp_port: int = Field(default=587, gt=0)
smtp_user: str = ""
smtp_password: str = ""
mail_from: str = ""
smtp_timeout_seconds: float = Field(default=10, gt=0)
email_code_ttl_minutes: int = Field(default=15, gt=0)
email_code_cooldown_seconds: int = Field(default=60, ge=0)
```

- `smtp_configured` property: `smtp_host`, `smtp_user`, `smtp_password`, and
  `mail_from` all non-empty.
- `validate_production_security`: the `INSTANCE_CODE` check is **replaced**
  by “production requires `smtp_configured`” (`ValueError` naming the missing
  variables otherwise). `SECRET_KEY` and `CLIENT_ORIGIN` checks unchanged.
- Development with empty `smtp_host`: register auto-verifies
  (`verified_at = now`, session issued — same branch that the empty
  `INSTANCE_CODE` uses today), and `verify`/`reset` skip code validation
  entirely (any 6-digit input passes; no rows written, no email sent).

## API changes (`server/app/routers/auth.py`, `schemas/auth.py`, `services/auth.py`)

All new/changed endpoints keep `Depends(enforce_auth_rate_limit)`.

### `POST /auth/send-code` (new)

- Body `SendCodeRequest { email: EmailStr, purpose: Literal["verify", "reset"] }`.
- Behavior: normalize email; if no such user → 204, do nothing. If user
  exists → apply cooldown, generate code, delete prior codes for the pair,
  insert, commit, send email.
- Response: always `204 No Content`. Never reveals whether the email exists.
- A `reset` code is issued regardless of `verified_at`. Confirming a reset
  sets the new password but does **not** verify the account — verification
  stays its own flow.

### `POST /auth/verify` (changed)

- Body `VerifyRequest { email: EmailStr, code: str = Field(pattern=r"^[0-9]{6}$") }`
  (`instance_code` field removed; wire name `code`).
- Service: look up the user by normalized email, consume the live `verify`
  code atomically. Success → set `verified_at`, issue session cookies,
  return `UserRead` (as today). Any failure (unknown email, no live code,
  wrong code, burned code) → single `400` with one generic message
  (“Verification failed. Check the code and try again.”). No detail may
  distinguish the cases.
- Dev mode (SMTP unconfigured): skip code consumption, keep today’s
  update-and-issue-session behavior.

### `POST /auth/reset` (changed)

- Body `ResetRequest { email, code (same pattern), new_password }`.
- Service: validate password strength first; consume the live `reset` code
  atomically; on success apply the existing reset logic (`password_hash`,
  `session_version += 1`, revoke all refresh tokens) → `204`. On any failure
  → `400` with one generic message shared with the unknown-email case
  (“Reset failed. Check the code and try again.”). This replaces today’s
  fully-opaque 204: the confirm step must be able to fail visibly, and one
  message for all failures preserves opacity.
- Dev mode: skip code consumption (mirrors empty `INSTANCE_CODE` today).

### `POST /auth/register` (behavior change, same contract)

- Response stays `201 UserRead`; cookies only when the account is
  auto-verified (dev mode) — unchanged.
- When SMTP is configured and the account was really created: after commit,
  generate + send a `verify` code. For the opaque “email already exists”
  path: no send (avoids existence leaks and spam vectors); the user gets the
  code via `send-code` from `VerifyPage`.

### Removals

- `services/auth.py`: `instance_code_matches`, `require_instance_code`,
  `INVALID_INSTANCE_CODE`; `UNVERIFIED` message reworded to point at the
  emailed code (“Verify your account with the code sent to your email.”).
- `Settings.instance_code` and its production validator.
- Schema field `instance_code`.

## Client changes

- `api/auth.ts`: `sendCode({ email, purpose })` → `POST /auth/send-code`;
  `verify({ email, code })`; `reset({ email, code, newPassword })`.
- `AuthProvider`: `verify(email, code)` signature update (callers:
  `VerifyPage` only).
- `VerifyPage`: email field stays (prefilled from register/login state).
  “Instance code” field becomes “Verification code” — `type="text"`,
  `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`.
  Description: “Enter the 6-digit code we emailed you.” A secondary
  “Resend code” button calls `sendCode(email, "verify")`, shows a transient
  confirmation, and is disabled during a visible cooldown (~60 s countdown).
- `ResetPage`: two steps in one page.
  1. Email + “Send code” button → calls `sendCode(email, "reset")`, always
     shows step 2 afterwards (the response is opaque).
  2. Code + new password + “Reset password” (existing `PasswordRules` UX
     kept). A “Back” affordance returns to step 1.
- `LoginPage`/`RegisterPage`: navigation to `/verify` with `{ email }` state
  unchanged; only copy mentioning the instance code changes.
- Copy stays English, sentence case, typographic apostrophes; design tokens
  and `AuthCard` layout unchanged.

## Infrastructure and operations

- `docker-compose.prod.yml`: drop `INSTANCE_CODE`; add `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` (required via
  `${VAR:?…}` for host/user/password/from). Add
  `extra_hosts: ["host.docker.internal:host-gateway"]` so the API container
  can reach the host when needed; `SMTP_HOST` must be the mail server’s
  canonical hostname (e.g. `mail.holtia.xyz`) because STARTTLS now verifies
  its certificate (ledger Ruling 3). `docs/operations.md` documents the
  Mailcow specifics.
- `docker-compose.yml` (dev): drop the `INSTANCE_CODE` passthrough; no SMTP
  variables → dev auto-verify.
- `.env.example`: remove the `INSTANCE_CODE` block; add an SMTP block
  (host, port, user, password, from, TTL, cooldown) with comments, including
  that leaving `SMTP_HOST` empty in development skips email entirely.
- Mailcow (operator, one-time, outside this repo): create the mailbox
  (e.g. `holtia@holtia.xyz`), note its SMTP credentials for the VPS `.env`.
- Doc updates: `docs/operations.md` (env table, first-run checklist, leaked
  secrets section), `README.md`, `server/README.md`, `docs/execution.md`
  (Auth row), `docs/review.md` (mark the shared-`INSTANCE_CODE` risk
  resolved), `AGENTS.md` (stub/stand-in note).

## Security review points (from `docs/roadmap-v2.md`, how each is met)

- Cryptographically random value, DB stores only a hash → `secrets`, SHA-256.
- Short TTL, single-shot, atomic consumption → 15 min default, `FOR UPDATE`
  + `consumed_at` in one transaction.
- Request/confirm endpoints do not reveal whether the email exists →
  `send-code` always 204; confirm failures share one generic message;
  register’s opaque path unchanged; SMTP errors never surface.
- Rate limits per IP and per normalized email with cooldown → existing
  per-IP limiter on every auth endpoint; per-email cooldown on sends;
  5-attempt burn caps per-code guessing. (Shared cross-process limiter is a
  separate roadmap item.)
- Codes never appear in logs → raw code exists only in the email body;
  log statements cover address/outcome/exception only.
- Reset invalidates every session → existing `session_version` + refresh
  token revocation, unchanged.

## Testing

Server (pytest, in-memory SQLite, no network):

- `email_codes` service: generate/hash/consume; expired code rejected;
  consumed code rejected twice; 5 wrong attempts burns the code; cooldown
  suppresses resend; new code deletes the previous one for the pair.
- `send-code`: 204 for unknown email and no send attempted; sends for a
  known email; respects cooldown; both purposes.
- `verify`: happy path sets `verified_at` and cookies; wrong/expired/burned
  code and unknown email all return the same 400; dev mode passes without a
  code.
- `reset`: happy path rotates `session_version`, revokes refresh tokens;
  failures share one 400; dev mode passes without a code.
- `register`: sends a verify code when SMTP configured; auto-verifies when
  not; existing-email path sends nothing.
- Config: production rejects missing SMTP settings; development allows them
  empty; the old `INSTANCE_CODE` tests are removed.
- Fake sender captures messages so tests assert on recipients/subjects and
  extract the raw code from the body when a flow needs the real value.

Client (Vitest):

- `VerifyPage`: submits `{email, code}`; resend button calls send-code and
  shows confirmation/cooldown; error rendering.
- `ResetPage`: step 1 → send-code → step 2; submit `{email, code,
  newPassword}`; password-rule validation still blocks weak passwords; back
  to step 1.
- Existing tests updated for the new payloads and copy.

## Rollout

1. Operator creates the Mailcow mailbox and adds SMTP vars to the VPS `.env`
   **before** deploying (the new API refuses to start in production without
   them).
2. Deploy runs migration `20261010_0015` as usual (`scripts/migrate.py`).
3. `INSTANCE_CODE` can be deleted from the VPS `.env` after deploy.
4. Unverified accounts created before the change simply use “Resend code” /
   `send-code`; no data backfill is needed. Reset for existing users now
   requires the emailed code — documented in `docs/operations.md`.

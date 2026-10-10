# Email One-Time Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared `INSTANCE_CODE` with per-user, single-use 6-digit codes emailed over Mailcow SMTP for account verification and password reset.

**Architecture:** New `email_codes` table stores SHA-256 hashes of short-lived codes; a stdlib `smtplib` sender (no new dependencies) mails codes; `/auth/send-code` plus reworked `/auth/verify` and `/auth/reset` consume them atomically. Client `VerifyPage`/`ResetPage` move from instance-code entry to typed code with resend. `INSTANCE_CODE` is deleted everywhere.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (Postgres, SQLite in tests), Pydantic v2, pytest; Vite + React 19 + TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-email-one-time-codes-design.md`

## Global Constraints

- Shell is PowerShell on Windows: chain commands with `;`, never `&&`.
- Server commands run from `server/` with `.\.venv\Scripts\python.exe -m …` (pytest, ruff). Client commands from `client/` (`npm run lint`, `npm test`, `npm run build`).
- No new dependencies anywhere (stdlib `smtplib` / `email.message` only).
- Python 3.13, SQLAlchemy 2 style (`Mapped[…]`, `mapped_column`, UUID PKs), Pydantic v2; wire names camelCase via `ApiModel`.
- UI copy English, sentence case, typographic apostrophes (’); theme tokens only (`ink`, `moss`, `line`, …); named exports; props typed with local `interface`, no `React.FC`.
- Codes must never appear in logs, API responses, or stored rows (hash only).
- `docs/roadmap-v2.md` acceptance list for “SMTP and per-user tokens” is binding.

## Review Focus

Failure modes the spec implies; each is pinned by a test in the named task.

- SMTP server down or credentials wrong when a code is requested → the endpoint still answers the normal opaque way, the request did not leak that the account exists; the user can retry after cooldown. (Task 4, `test_send_code_survives_smtp_failure`)
- A code used once, then presented again (replay) → rejected with the same generic error as a wrong code. (Task 3 unit, Task 5 endpoint: `test_consume_is_single_shot`, `test_verify_rejects_used_code`)
- Brute-forcing the 6-digit space → after 5 wrong entries the code is burned and even the correct value is refused. (Task 3, `test_wrong_attempts_burn_code`)
- The raw code appearing in any log line or error text → logs reference email and purpose only. (Task 4, `test_send_failure_log_has_no_code` via `caplog`)
- Reset must not verify an unverified account; verify must not change a password. (Task 5, `test_reset_does_not_verify`, `test_verify_does_not_change_password`)

---

### Task 1: `EmailCode` model + migration

**Files:**
- Create: `server/app/models/email_code.py`
- Modify: `server/app/models/__init__.py` (import + `__all__`)
- Modify: `server/app/models/user.py` (add `email_codes` relationship)
- Create: `server/migrations/versions/20261010_0015_email_codes.py`
- Test: `server/tests/test_email_code_model.py`

**Interfaces:**
- Consumes: `app.db.Base`, existing `User` model.
- Produces: `EmailCode` with columns `id: uuid.UUID`, `user_id: uuid.UUID`, `purpose: str` (`"verify"`/`"reset"`), `code_hash: str(64)`, `attempts: int`, `expires_at: datetime`, `consumed_at: datetime | None`, `created_at: datetime`; `User.email_codes` relationship (`cascade="all, delete-orphan"`, `passive_deletes=True`). Alembic head becomes `20261010_0015` (revises `20260921_0014`).

- [ ] **Step 1: Write the failing test** — `server/tests/test_email_code_model.py`: create the schema (`Base.metadata.drop_all`/`create_all` as `conftest.client` does), then in a `Session(engine)`: add a `User`, add an `EmailCode(user_id=user.id, purpose="verify", code_hash="a"*64, expires_at=now+15min)`, flush, re-query by `(user_id, purpose)` and assert the row, `attempts == 0`, `consumed_at is None`; delete the user and assert the code row cascades away.

- [ ] **Step 2: Run it, verify it fails** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_email_code_model.py -v` → import error for `app.models.email_code`.

- [ ] **Step 3: Implement** — model mirrors `refresh_token.py`: `id` UUID PK `default=uuid.uuid4`; `user_id` `ForeignKey("users.id", ondelete="CASCADE")`, `index=True`; `purpose` `String(8)`; `code_hash` `String(64)`; `attempts` `Integer` `default=0`, `server_default="0"`; `expires_at` `DateTime(timezone=True)`; `consumed_at` `DateTime(timezone=True)` nullable; `created_at` `DateTime(timezone=True)` `server_default=func.now()`; `__table_args__ = (Index("ix_email_codes_user_purpose", "user_id", "purpose"),)`. Register in `models/__init__.py` (`EmailCode`). In `user.py` add `email_codes: Mapped[list["EmailCode"]]` relationship like `refresh_tokens`. Migration file follows `20260921_0014` header style; `upgrade()` = `op.create_table("email_codes", sa.Uuid(), …, sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"))` + `op.create_index("ix_email_codes_user_purpose", "email_codes", ["user_id", "purpose"])`; `downgrade()` drops index and table.

- [ ] **Step 4: Run tests, verify pass** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_email_code_model.py -v` → PASS. Also `.\.venv\Scripts\python.exe -m ruff check .` clean.

- [ ] **Step 5: Commit** — `git add server/app/models server/migrations/versions/20261010_0015_email_codes.py server/tests/test_email_code_model.py ; git commit -m "feat(server): add email_codes table and model"`

### Task 2: SMTP settings + stdlib email sender

**Files:**
- Modify: `server/app/config.py` (new fields + property only; do NOT touch `instance_code` or validators yet)
- Create: `server/app/services/email.py`
- Test: `server/tests/test_email.py`, extend `server/tests/test_config.py`

**Interfaces:**
- Consumes: `Settings` (pydantic-settings, env-driven).
- Produces: `Settings` fields `smtp_host: str = ""`, `smtp_port: int = Field(default=587, gt=0)`, `smtp_user: str = ""`, `smtp_password: str = ""`, `mail_from: str = ""`, `smtp_timeout_seconds: float = Field(default=10, gt=0)`, `email_code_ttl_minutes: int = Field(default=15, gt=0)`, `email_code_cooldown_seconds: int = Field(default=60, ge=0)`; property `Settings.smtp_configured -> bool` (True iff host, user, password, mail_from all non-empty). Function `send_code_email(settings: Settings, *, to: str, code: str, purpose: str) -> None` raising on SMTP failure; subjects `"Your Holtia verification code"` / `"Your Holtia password reset code"`.

- [ ] **Step 1: Write failing tests** — in `test_config.py`: `test_smtp_configured_requires_all_four` (Settings with each subset → `smtp_configured` False; all four → True; defaults → False). In new `test_email.py`: monkeypatch `app.services.email.smtplib.SMTP` with a recording fake class; call `send_code_email(settings, to="ada@example.com", code="123456", purpose="verify")`; assert the fake recorded `starttls()`, `login(user, password)`, exactly one `send_message`, message `["From"] == settings.mail_from`, `["To"]`, subject `"Your Holtia verification code"`, `"123456" in body`, `"15" in body` (expiry minutes from settings); same for `"reset"` → subject `"Your Holtia password reset code"` and body contains a sentence telling the user to ignore the mail if they did not request it (assert `"ignore"` in body.lower()).

- [ ] **Step 2: Run, verify fail** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_config.py tests/test_email.py -v`.

- [ ] **Step 3: Implement** — add the fields/property to `Settings`. `email.py`: `from email.message import EmailMessage; import smtplib`. Internal mapping `PURPOSE_SUBJECTS = {"verify": "Your Holtia verification code", "reset": "Your Holtia password reset code"}`. `send_code_email` builds `EmailMessage` (plain-text `set_content`, body mentions `settings.email_code_ttl_minutes`), then `with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp: smtp.starttls(); smtp.login(settings.smtp_user, settings.smtp_password); smtp.send_message(message)`. Let exceptions propagate (caller logs).

- [ ] **Step 4: Run tests, verify pass** — same command; also ruff.

- [ ] **Step 5: Commit** — `git add server/app/config.py server/app/services/email.py server/tests/test_config.py server/tests/test_email.py ; git commit -m "feat(server): smtp settings and stdlib code email sender"`

### Task 3: Code issue/consume service

**Files:**
- Create: `server/app/services/email_codes.py`
- Test: `server/tests/test_email_codes.py`

**Interfaces:**
- Consumes: `EmailCode` (Task 1), `Settings.email_code_*` fields (Task 2).
- Produces: `MAX_CODE_ATTEMPTS = 5`; `hash_email_code(code: str) -> str` (SHA-256 hexdigest, same shape as `hash_refresh_token`); `issue_code(db: Session, settings: Settings, *, user_id: uuid.UUID, purpose: str) -> str | None` (returns the raw 6-digit code, or `None` when suppressed by cooldown; deletes previous rows for the pair; commits); `consume_code(db: Session, settings: Settings, *, user_id: uuid.UUID, purpose: str, code: str) -> bool` (finds the live row `FOR UPDATE`, compares with `secrets.compare_digest`, sets `consumed_at` on match, increments `attempts` and burns at `MAX_CODE_ATTEMPTS` on mismatch; never commits — caller owns the transaction).

- [ ] **Step 1: Write failing tests** — `test_email_codes.py` uses a `Session(engine)` directly (fixture pattern from Task 1). Settings fixture: `Settings(environment="test", database_url="sqlite+pysqlite:///:memory:", secret_key="x"*32, smtp_host="smtp.test", smtp_user="u", smtp_password="p", mail_from="h@test", email_code_cooldown_seconds=0, email_code_ttl_minutes=15)`. Tests:
  - `test_issue_returns_six_digit_code_and_stores_hash_only` — code matches `^[0-9]{6}$`; stored row `code_hash == hash_email_code(code)`; raw code not present in any column.
  - `test_issue_replaces_previous_code` — after two issues, one row for the pair.
  - `test_cooldown_suppresses_issue` — settings with `email_code_cooldown_seconds=60`: second `issue_code` immediately → `None`, previous row still alive.
  - `test_consume_is_single_shot` — consume(correct) True; consume(correct) again False.
  - `test_consume_rejects_expired` — row with `expires_at` in the past → False.
  - `test_wrong_attempts_burn_code` — 5 wrong entries → subsequent consume with the right code returns False; assert `attempts` grew on the row before burning.
  - `test_consume_wrong_code_increments_attempts` — 1 wrong attempt: `attempts == 1`, code still consumable afterwards.

- [ ] **Step 2: Run, verify fail** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_email_codes.py -v`.

- [ ] **Step 3: Implement** — `issue_code`: `latest = db.scalar(select(EmailCode).where(user_id, purpose).order_by(EmailCode.created_at.desc()).limit(1))`; if cooldown and `latest` younger than `email_code_cooldown_seconds` → `None`. Otherwise `db.execute(delete(EmailCode).where(user_id, purpose))`, `code = f"{secrets.randbelow(1_000_000):06d}"`, add row with `expires_at=datetime.now(UTC) + timedelta(minutes=settings.email_code_ttl_minutes)`, `db.commit()`, return code. `consume_code`: `row = db.scalar(select(EmailCode).where(EmailCode.user_id == user_id, EmailCode.purpose == purpose, EmailCode.consumed_at.is_(None), EmailCode.expires_at > datetime.now(UTC)).with_for_update())`; `None` → False; digest mismatch → `row.attempts += 1`; if `row.attempts >= MAX_CODE_ATTEMPTS: row.consumed_at = now`; `db.flush()`; False. Match → `row.consumed_at = now`, `db.flush()`, True. SQLite ignores `FOR UPDATE` — fine in tests; Postgres enforces it.

- [ ] **Step 4: Run tests, verify pass** — same command; ruff clean.

- [ ] **Step 5: Commit** — `git add server/app/services/email_codes.py server/tests/test_email_codes.py ; git commit -m "feat(server): atomic email code issue and consume"`

### Task 4: `POST /auth/send-code` + register auto-send

**Files:**
- Modify: `server/app/schemas/auth.py` (add `SendCodeRequest`)
- Modify: `server/app/services/auth.py` (add `send_code`; switch register auto-verify condition to `not settings.smtp_configured`; register sends a verify code when configured)
- Modify: `server/app/routers/auth.py` (new route)
- Modify: `server/tests/conftest.py` (SMTP test env + fake sender capture)
- Test: `server/tests/test_send_code.py`, adjust broken tests in `server/tests/test_auth.py`

**Interfaces:**
- Consumes: `issue_code` (Task 3), `send_code_email` (Task 2), `normalize_email`.
- Produces: router `POST /auth/send-code` (204, `Depends(enforce_auth_rate_limit)`), body `{"email", "purpose"}` with `purpose: Literal["verify", "reset"]`; service `send_code(db: Session, settings: Settings, email: str, purpose: str) -> None` (opaque, never raises); conftest: module-level `SENT_EMAILS: list[tuple[str, str, str]]` (to, code, purpose), autouse fixture monkeypatching `app.services.auth.send_code_email` to record into it and `SENT_EMAILS.clear()` per test, helper `def sent_code(email: str, purpose: str) -> str` returning the newest captured code (fails the test if none), helper `def enable_email_cooldown(client, seconds)` — no; cooldown-sensitive tests override settings themselves (Task 3 already unit-covers cooldown).

- [ ] **Step 1: Update conftest** — add env lines before app import: `SMTP_HOST=smtp.test`, `SMTP_USER=u`, `SMTP_PASSWORD=p`, `MAIL_FROM=holtia@example.com` (leave `EMAIL_CODE_COOLDOWN_SECONDS` unset; default 60 would throttle tests, so also set it to `0`). Add the autouse fake-sender fixture and `sent_code` helper described above. Keep the existing `INSTANCE_CODE` env for now (removed in Task 8).

- [ ] **Step 2: Write failing endpoint tests** — `test_send_code.py` (using `client`, `register` from conftest):
  - `test_send_code_unknown_email_is_still_204` — 204, `SENT_EMAILS` empty.
  - `test_send_code_verify_and_reset_purposes_send_one_email_each` — after `register_verified` (still works: instance-code verify untouched this task), post `/api/auth/send-code` with purpose reset → 204 and one captured `(email, code, "reset")`.
  - `test_send_code_rejects_bad_purpose` — `{"email": …, "purpose": "admin"}` → 422.
  - `test_send_code_respects_cooldown` — override `get_settings` with `email_code_cooldown_seconds=600`: two `/auth/send-code` calls → both 204, `SENT_EMAILS` has exactly one entry (issue path unit-tested in Task 3; this pins the endpoint contract).
  - `test_send_code_survives_smtp_failure` — monkeypatch sender to raise `ConnectionRefusedError("smtp down")`; response still 204.
  - `test_send_failure_log_has_no_code` — same failing sender, `caplog.at_level(logging.WARNING)`; assert the code value (or any 6-digit token from SENT/issued rows) is not in `caplog.text`; email address may appear.
- Extend `test_auth.py`: `test_register_when_email_smtp_configured_sends_verify_code` — default test settings are SMTP-configured now, so the current expectation “register leaves account unverified, no cookies” still holds; assert one captured `("…", code, "verify")`. Update the existing `test_register_auto_verifies_when_instance_code_is_empty` to instead override `Settings(instance_code="", smtp_host="", …)` (unconfigured SMTP ⇒ auto-verify path after this task).
- Also update register-opaque-path expectation: registering a second time with the same email sends no new email (`test_register_existing_email_sends_no_email`).

- [ ] **Step 3: Run, verify fail** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_send_code.py -v` → 404 on unknown route / missing symbols.

- [ ] **Step 4: Implement** — `SendCodeRequest(ApiModel)`: `email: EmailStr`, `purpose: Literal["verify", "reset"]`. In `auth.py`:

```python
def send_code(db: Session, settings: Settings, email: str, purpose: str) -> None:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None:
        return
    code = issue_code(db, settings, user_id=user.id, purpose=purpose)
    if code is None:
        return
    try:
        send_code_email(settings, to=user.email, code=code, purpose=purpose)
    except Exception:
        logger.warning("Email send failed for %s purpose=%s", user.email, purpose)
```

(`logger = logging.getLogger(__name__)` at module top; never log `code`.) In `register()`: replace `settings.instance_code == ""` with `not settings.smtp_configured` for the auto-verify decision; after the final `db.commit()` of a truly created unverified user, call `send_code(db, settings, email, "verify")`. Router: `send_code` route as described, always `Response(status_code=204)` — service returns None; add `_rate_limit` dependency.

- [ ] **Step 5: Run the whole server suite, verify pass** — `cd server ; .\.venv\Scripts\python.exe -m pytest -v ; .\.venv\Scripts\python.exe -m ruff check .`

- [ ] **Step 6: Commit** — `git add server/app server/tests ; git commit -m "feat(server): send-code endpoint and register email"`

### Task 5: Code-based `verify` and `reset`

**Files:**
- Modify: `server/app/schemas/auth.py`
- Modify: `server/app/services/auth.py`
- Modify: `server/tests/conftest.py` (`verify` / `register_verified` helpers)
- Modify: `server/tests/test_auth.py` (rewrite verify/reset sections), `server/tests/test_login_flow` message expectations if any (grep `instance code` in tests)

**Interfaces:**
- Consumes: `consume_code` (Task 3), `sent_code` (Task 4 conftest).
- Produces: `VerifyRequest { email, code: str = Field(pattern=r"^[0-9]{6}$") }`; `ResetRequest(VerifyRequest)` + `new_password`; removed from `auth.py`: `require_instance_code`, `instance_code_matches`, `INVALID_INSTANCE_CODE`. New constants: `VERIFY_FAILED = "Verification failed. Check the code and try again."`, `RESET_FAILED = "Reset failed. Check the code and try again."`, `UNVERIFIED = "Verify your account with the code sent to your email."`. `verify(db, settings, email, code)` and `reset_password(db, settings, email, code, new_password)` keep their positional shape `(db, settings, payload fields…)`.

- [ ] **Step 1: Rewrite conftest helpers** — `verify(client, email=…, code=None)`: when `code is None`, take `sent_code(email, "verify")`; posts `{"email": email, "code": code}`. `register_verified`: `register` (201; SMTP configured ⇒ verify code sent) then `verify`. Keep `instance_code` out of payloads.

- [ ] **Step 2: Write failing tests** — in `test_auth.py` (replace the old instance-code verify/reset tests):
  - `test_verify_rejects_wrong_code` → 400 with detail exactly `VERIFY_FAILED` message string.
  - `test_verify_unknown_email_same_error` → `test_verify_rejects_wrong_code` but email never registered → identical status and detail.
  - `test_verify_rejects_used_code` → verify once 200, verify again 400 generic.
  - `test_verify_does_not_change_password` → after code-verify, login with original password works.
  - `test_reset_rejects_wrong_code` → 400 detail `RESET_FAILED`; password unchanged (old password still logs in).
  - `test_reset_requires_strong_password_before_code` → weak `newPassword` → 422 (validation order: `require_strong_password` first, same status code message as register tests already assert).
  - `test_reset_with_code_rotates_sessions` → existing behaviour kept: after correct reset, old cookies 401 refresh, new password logs in (adapt existing test body).
  - `test_reset_does_not_verify` → register (SMTP configured), request+consume reset code for the still-unverified account; then login attempt → 403 `UNVERIFIED` with the new wording.
  - `test_dev_mode_skips_codes` — override `app.dependency_overrides[get_settings]` with `Settings(smtp_host="", …)`: register auto-verifies; `verify` with `"000000"` succeeds for a pre-existing unverified user; reset succeeds without any code in `SENT_EMAILS`.
- Update `LoginPage.test.tsx`/client expectations only in Tasks 6–7 (server-side string change lands here).

- [ ] **Step 3: Run, verify fail** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_auth.py -v`.

- [ ] **Step 4: Implement** — `verify`: normalize email, look user up; if `not settings.smtp_configured`: keep today’s UPDATE-and-issue path minus `require_instance_code`; else live-code path: `ok = consume_code(db, settings, user_id=user.id, purpose="verify", code=code)` only when user exists and `user.verified_at is None`; on `ok` set `verified_at`, `issue_session`, commit, return `(user, tokens)`; any other combination → rollback, 400 `VERIFY_FAILED`. Keep the existing atomic UPDATE shape for the dev path if convenient. `reset_password`: signature `(db, settings, email, code, new_password)`; order: `require_strong_password` (422) → user lookup (`with_for_update` as today) → dev bypass or `consume_code(purpose="reset")` → not ok → rollback + 400 `RESET_FAILED` (same error whether user missing or code bad — for a missing user skip consume and fail identically without distinguishing) → ok: existing password/session rotation block, commit. Router passes `payload.code`; delete instance-code constants; `UNVERIFIED` wording change; adjust any test asserting old strings (`grep -n "instance code" server/tests`).

- [ ] **Step 5: Full suite green** — `cd server ; .\.venv\Scripts\python.exe -m pytest ; .\.venv\Scripts\python.exe -m ruff check .`

- [ ] **Step 6: Commit** — `git add server/app server/tests ; git commit -m "feat(server): verify and reset via emailed codes"`

### Task 6: Client API + `VerifyPage` with resend

**Files:**
- Modify: `client/src/api/auth.ts`
- Modify: `client/src/auth/AuthProvider.tsx`
- Modify: `client/src/pages/VerifyPage.tsx`
- Modify: `client/src/pages/VerifyPage.test.tsx`, `client/src/pages/LoginPage.test.tsx` (string “Verify your account with the instance code.” → new wording)

**Interfaces:**
- Consumes: endpoints from Task 5 (`/auth/send-code`, `{email, code}` payloads).
- Produces: `authApi.sendCode(payload: { email: string; purpose: "verify" | "reset" }): Promise<void>`; `authApi.verify({ email, code })`; `AuthProvider.verify(email: string, code: string)`.

- [ ] **Step 1: Rewrite `VerifyPage.test.tsx` (failing)** — mocks: `POST /auth/send-code` → 204; `POST /auth/verify` → 200 user. Assert: form has label “Verification code” and no “Instance code” text anywhere; submitting email+“123456” calls `/auth/verify` with body `{ email, code: "123456" }` and navigates home; clicking “Resend code” (button name, `role="button"`) POSTs `/auth/send-code` with `{email, purpose:"verify"}` and shows “Code sent”-style confirmation (`screen.findByText(/code sent/i)`); after resend the button enters cooldown state (disabled, label shows seconds) — implement test with `vi.useFakeTimers()` if convenient, otherwise assert only the disabled-after-click state.

- [ ] **Step 2: Run, verify fail** — `cd client ; npm test` (fails on VerifyPage tests; Update `LoginPage.test.tsx` 403-detail string here too).

- [ ] **Step 3: Implement** — `api/auth.ts`: replace `VerifyPayload` with `{ email: string; code: string }`, add `sendCode` (POST, `body: JSON.stringify(payload)`, response `void`). `AuthProvider.verify(email, code)` passes `{ email, code }`. `VerifyPage`: keep email input + prefill; second field `name="code"`, label “Verification code”, `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, `pattern="[0-9]{6}"`, `type="text"` (no password masking for 6 short digits copied from email); description copy “Enter the 6-digit code we emailed you.”; secondary resend control below the primary button — plain button styled like existing secondary links/buttons in `AuthCard` (`buttonClassName` variants already in the codebase — reuse, check `components/AuthCard.tsx` for what exists; if only one button style exists, use `rounded-md border border-line` per design skill). Cooldown: local constant `RESEND_COOLDOWN_SECONDS = 60`, `useEffect` ticking countdown while `cooldown > 0`, disabled + label “Resend code in 60s” style; clicking calls `sendCode`, sets cooldown, shows `aria-live="polite"` confirmation. Server errors keep `authErrorClassName` rendering.

- [ ] **Step 4: Verify** — `cd client ; npm test ; npm run lint`.

- [ ] **Step 5: Commit** — `git add client/src ; git commit -m "feat(client): verify page uses emailed code with resend"`

### Task 7: Client `ResetPage` two-step flow

**Files:**
- Modify: `client/src/pages/ResetPage.tsx`, `client/src/pages/ResetPage.test.tsx`

**Interfaces:**
- Consumes: `authApi.sendCode`, `authApi.reset({ email, code, newPassword })` (Task 6).
- Produces: internal page state `step: "email" | "code"`; no exported interfaces.

- [ ] **Step 1: Rewrite `ResetPage.test.tsx` (failing)** — step 1: renders email field + “Send code” button; submit POSTs `/auth/send-code` `{email, purpose:"reset"}` (204) and reveals step 2 (label “Verification code” + “New password” appear — `findByLabelText`). Step 2: submit with code+password POSTs `/auth/reset` `{email, code, newPassword}`; success navigates to `/login`; “Wrong code.” path: mock 400 detail, message rendered, weak-password rule check still blocks client-side (keep existing assertion). Back control returns to step 1 with email preserved. No “Instance code” string remains.

- [ ] **Step 2: Run, verify fail** — `cd client ; npm test`.

- [ ] **Step 3: Implement** — mirror existing form patterns; code input attributes identical to Task 6. Email stays in component state (`useState`) so step 2 can resubmit it. Cooldown/resend not required in step 2 (send already happened); do not add it — YAGNI.

- [ ] **Step 4: Verify** — `cd client ; npm test ; npm run lint ; npm run build`.

- [ ] **Step 5: Commit** — `git add client/src/pages/ResetPage.tsx client/src/pages/ResetPage.test.tsx ; git commit -m "feat(client): two-step password reset with emailed code"`

### Task 8: Retire `INSTANCE_CODE` — config, infra, docs

**Files:**
- Modify: `server/app/config.py`, `server/tests/test_config.py`, `server/tests/conftest.py`
- Modify: `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`
- Modify: `README.md`, `server/README.md`, `docs/operations.md`, `docs/execution.md`, `docs/product.md`, `docs/review.md`, `AGENTS.md`, `docs/roadmap-v2.md`

**Interfaces:**
- Consumes: everything above is text/config; behavior hinge is the production validator.
- Produces: `Settings` with **no** `instance_code`; production validator requiring SMTP.

- [ ] **Step 1: Write failing config tests** — in `test_config.py`: delete the three `INSTANCE_CODE` tests; add `test_production_requires_configured_smtp` — `Settings(environment="production", secret_key=<strong>, client_origin="https://x", smtp_host="")` raises `ValidationError` matching `/SMTP_/` in message (list the missing var names), and passing all SMTP vars + `MAIL_FROM` validates. Development with empty SMTP still validates.

- [ ] **Step 2: Run, verify fail** — `cd server ; .\.venv\Scripts\python.exe -m pytest tests/test_config.py -v`.

- [ ] **Step 3: Implement config** — remove `instance_code` field; in `validate_production_security` replace the length check with: `if not self.smtp_configured: raise ValueError("SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM are required in production.")`. `conftest.py`: drop `os.environ["INSTANCE_CODE"]`, drop `instance_code=` from `enable_ai`/Settings constructions; `client` fixture env already supplies SMTP (Task 4).

- [ ] **Step 4: Infra files** — `docker-compose.yml`: delete the `INSTANCE_CODE` line. `docker-compose.prod.yml`: delete it; add `SMTP_HOST: ${SMTP_HOST:-host.docker.internal}`, `SMTP_PORT: ${SMTP_PORT:-587}`, `SMTP_USER: ${SMTP_USER:?Set SMTP_USER}`, `SMTP_PASSWORD: ${SMTP_PASSWORD:?Set SMTP_PASSWORD}`, `MAIL_FROM: ${MAIL_FROM:?Set MAIL_FROM}` and `extra_hosts: ["host.docker.internal:host-gateway"]` on the `server` service. `.env.example`: remove the INSTANCE_CODE block; add an SMTP block documenting host/port/user/password/from (Mailcow mailbox, e.g. `holtia@holtia.xyz`), note that empty `SMTP_HOST` in development skips verification codes entirely, and that production refuses to start without SMTP.

- [ ] **Step 5: Docs pass** — update every `INSTANCE_CODE`/“instance code” mention to the email-code reality: `README.md` (intro warning, dev setup, prod secrets list), `server/README.md`, `docs/operations.md` (env table, first-run checklist: create Mailcow mailbox + set vars before deploy; leaked-code procedure: codes expire on their own; “After a leaked INSTANCE_CODE” text → rotate SMTP mailbox password instead), `docs/execution.md` (Auth row + “Now:” paragraph), `docs/product.md` line about keeping the code private, `docs/review.md` risk 1 marked resolved, `AGENTS.md` (backend conventions stub note and icons/scope section), `docs/roadmap-v2.md` move “SMTP and per-user tokens” to shipped status (keep remaining public-blockers listed).

- [ ] **Step 6: Full verification** — `cd server ; .\.venv\Scripts\python.exe -m pytest ; .\.venv\Scripts\python.exe -m ruff check .` then `cd ../client ; npm run lint ; npm test ; npm run build`. Then `grep` (use grep_search tool) for `INSTANCE_CODE` / `instance code` across the repo → zero hits outside historical roadmap-v2 wording that explicitly names the retired secret.

- [ ] **Step 7: Commit** — `git add -u ; git commit -m "chore: retire INSTANCE_CODE in favour of emailed codes"`

---

## Rollout note (not a task)

Before deploying: create the Mailcow mailbox, put SMTP vars in the VPS `.env`, deploy (migration runs automatically), only then delete `INSTANCE_CODE` from the VPS `.env`. Documented in `docs/operations.md` by Task 8.

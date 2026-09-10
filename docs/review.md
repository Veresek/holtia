# Review (5 September 2026)

The August questionnaire is closed. This is a snapshot of the **implemented**
app, not another round of product questions. Locked decisions stay in
[product.md](product.md). How to run it is in [operations.md](operations.md).

## Locked (and shipped)

- Web, not Expo. React 19 + FastAPI + Postgres 18. No SMTP or Google in MVP.
- Five panels: Home, Calendar, Tasks, Notes, Account. AI bar off until `AI_ENABLED`.
- Home = around-now (1 h back, ≥3 h forward; desktop matches today’s tasks) + today’s **open** tasks (max 4,
  with a chevron to expand the rest) + **four** recent notes.
- Tasks: title + done + description + day; undated only in Tasks; pin to a
  block occurrence (`date` + `timeBlockId`).
- Block = one id. Repeat = the same row on many days. No occurrence exceptions.
  Overnight: `end < start`. Desktop Calendar is seven 24 h columns; a phone
  shows one day plus a week strip.
- Notes have no date (Keep). Pin to a block **series** (`timeBlockId`) and
  optionally to a task (`taskId`) from the note form.
- Auth: email/password; verify and reset = one `INSTANCE_CODE`. Delete account
  in MVP. Verify/reset UI is on guest routes, not on Account.
- Production Compose (API on localhost:8001) + host reverse proxy, Alembic, CI (ruff + pytest; client lint / test / build).

## Before a public VPS

These block opening registration to strangers. A private box for yourself is
fine.

### 1. Shared `INSTANCE_CODE` is account recovery — High

The same env secret verifies _and_ resets. `reset_password` does not require
the old password. Anyone with the code and an email can take the account,
including accounts that were already verified.

Publishing the code to make signup “open” is therefore a takeover primitive.
Hiding the code means strangers cannot verify — so registration is not actually
open.

**Target (v2, not this chore):** SMTP plus a random, hashed, short-lived,
single-use token per user and purpose (`verify` vs `reset`). Request/confirm
endpoints that do not leak whether the email exists. Rate limit per IP and per
email. Consume atomically. Keep codes out of logs. Reset still bumps
`session_version`. Until that exists, **do not publish `INSTANCE_CODE`** and do
not treat the VPS as a public instance.

Production only checks that the code is non-empty. A one-character code boots.
Development still skips verify when the code is empty.

### 2. Register enumerates emails — addressed

`POST /api/auth/register` no longer returns `409` for a duplicate email. The
response matches a fresh unverified signup (`201`, no cookies). Verify already
used a uniform error for unknown vs already-verified accounts.

### 3. Refresh rotation vs two tabs — addressed

A second use of a just-rotated refresh token within a short grace window
follows the family to the live token instead of calling `_revoke_chain`.
Reuse after the window is still treated as replay.

### 4. In-memory rate limit, one worker — Medium

`InMemoryRateLimiter` keys on `request.client.host`. Limits do not survive
process restart and do not share across workers. Fine for a private box; not
an anti-spam plan. Production Uvicorn now trusts `X-Forwarded-*` only from
private Docker ranges (`172.16.0.0/12`, `10.0.0.0/8`) and `127.0.0.1`, not `*`.

## Addressed after this review

Not blockers for a private deploy; shipped so the snapshot stays true.

- Home: chevron expands the rest of today’s open tasks after the first four.
- Calendar: one day + week strip below `md`; desktop week unchanged.
- Note form: pin to a task (`taskId`), shown on the card.
- Account: unverified status only; verify/reset stay on guest routes.
- Calendar tiles: pinned titles are buttons; leftover count is “+N more”.
- Cards: the body (padding, description, date, pin line) opens edit; checkbox, markdown chevron, links, and ⋮ stay their own actions. Title remains the keyboard path; ⋮ is 44px.
- Tasks: completed items older than today (Warsaw) live in Archive on the Tasks panel; `completed_at` is set when `done` becomes true.
- Time blocks: optional colour token (`moss`, `lichen`, `rust`, `ink`) tints the tile border; one colour per series.
- Host reverse proxy: CSP, `Cache-Control` split (`no-cache` HTML vs immutable `/assets`); see `docs/operations.md`.
- `PATCH /api/users/me` detail is “Changing email is not available yet.”

## Safety, privacy, performance

| Item                                                                                                                | Severity     | Notes                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| Passwords bcrypt (12), dummy hash on unknown login, HttpOnly cookies, `Secure` when origin is HTTPS, `SameSite=lax` | Good         | Keep it                                                                  |
| Markdown links strip `javascript:` / `data:` / `vbscript:`                                                          | Good         | `MarkdownBody.tsx`                                                       |
| SPA loads **all** tasks, notes, and blocks, then fingerprints via `/state` every 60 s                               | Medium later | Fine for one user; N01 will fail if collections grow. `DataProvider.tsx` |
| No pagination, no `ETag`                                                                                            | Low now      | Same                                                                     |
| Host reverse proxy CSP + Cache-Control split for `/index.html` vs hashed assets                                     | Good         | Keep it; snippet in `operations.md`                                      |

## What can wait

- Captcha, admin roles, export, Google, Expo.
- Streaming, conversation history, OpenRouter, AI pins/edits.
- Benchmarks for N01.
- Redis (or shared) rate limits.
- `userApi.update` on the client until the server implements it.

## Next

No round 4. Use the app in September. If it goes on the VPS, keep the instance
code off the public internet. Email tokens are the gate for open registration.

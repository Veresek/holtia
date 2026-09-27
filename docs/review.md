# Review (5 September 2026)

The August questionnaire is closed. This is a snapshot of the **implemented**
app, not another round of product questions. Locked decisions stay in
[product.md](product.md). How to run it is in [operations.md](operations.md).

## Locked (and shipped)

- Web, not Expo. React 19 + FastAPI + Postgres 18. No SMTP or Google in MVP.
- Five panels: Home, Calendar, Tasks, Notes, Account. Assistant sheet off until `AI_ENABLED`.
- Home = around-now (1 h back, ≥3 h forward; desktop matches today’s tasks) + today’s **open** tasks (max 4,
  with a chevron to expand the rest) + **four** recent notes.
- Tasks: title + done + description + day; undated only in Tasks; pin to a
  block occurrence (`date` + `timeBlockId`).
- Block = one id. Repeat = the same row on many days. No occurrence exceptions.
  Overnight: `end < start`. Calendar is day, week, or month. Desktop week is
  seven 24 h columns; a phone week shows one day plus a week strip. Day is one
  24 h column. Month is a Monday-first grid.
- Notes may hang on a day (`date`), a block **series** (`timeBlockId`) and
  optionally a task (`taskId`) from the note form.
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

**Target (v2, not this chore):** see [roadmap-v2.md](roadmap-v2.md). Until that
exists, **do not publish `INSTANCE_CODE`** and do not treat the VPS as a public
instance.

Production requires the code to be at least 12 characters. Development still
skips verify when the code is empty.

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
- Calendar tiles: pinned titles are buttons that open a reading sheet; leftover
  count opens the pin list for that day, not the block form.
- Cards: the body (padding, description, date, pin line) opens edit; checkbox, markdown chevron, links, and ⋮ stay their own actions. Title remains the keyboard path; ⋮ is 44px.
- Tasks: completed items from before today in the account timezone live in Archive on the Tasks panel; `completed_at` is set when `done` becomes true.
- Time blocks: color is a hex fill (`#rrggbb`); five presets plus a custom picker sit on one row; one color per series.
- Motion: short fade/rise on dialogs, chevron rotation, and card border colour; `prefers-reduced-motion` still zeroes durations.
- Host reverse proxy: CSP, `Cache-Control` split (`no-cache` HTML vs immutable `/assets`); see `docs/operations.md`.
- `PATCH /api/users/me` saves `timezone`; sending `email` still returns 501 (“Changing email is not available yet.”).

## Addressed (27 September 2026)

- `/state` fingerprints include a pin count, so deleting a block or task reaches other devices without changing `updated_at`. The same device also clears those pins locally.
- An overnight block’s morning segment keeps the occurrence date it started on, on Home and in Calendar.
- A collection list fetched before a local edit no longer overwrites that edit.
- A note’s block chip names the real recurrence, and “today” in pin labels uses the account timezone.
- Notes can be searched. Account picks a timezone from the IANA list. AI task proposals show priority. Desktop keyboard shortcuts are listed with `?` and the button beside Account.
- Production `INSTANCE_CODE` must be at least 12 characters. API startup purges refresh tokens revoked more than 30 days ago, and a purge failure does not stop the process.

## Safety, privacy, performance

| Item                                                                                                                | Severity     | Notes                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| Passwords bcrypt (12), dummy hash on unknown login, HttpOnly cookies, `Secure` when origin is HTTPS, `SameSite=lax` | Good         | Keep it                                                                  |
| Markdown links strip `javascript:` / `data:` / `vbscript:`                                                          | Good         | `MarkdownBody.tsx`                                                       |
| SPA loads **all** tasks, notes, and blocks, then fingerprints via `/state` every 60 s                               | Medium later | Fine for one user; N01 will fail if collections grow. `DataProvider.tsx` |
| No pagination, no `ETag`                                                                                            | Low now      | Same                                                                     |
| Host reverse proxy CSP + Cache-Control split for `/index.html` vs hashed assets                                     | Good         | Keep it; snippet in `operations.md`                                      |

## What can wait

Everything after the MVP, including public registration, is in [roadmap-v2.md](roadmap-v2.md).

## Next

No round 4. Use the app in September. If it goes on the VPS, keep the instance
code off the public internet. Email tokens are the gate for open registration.

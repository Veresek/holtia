# Execution

As of 5 September 2026. MVP deadline: **end of September 2026**, after hours, solo, budget 0 PLN, OVH VPS.

The four-week build is done in code. What remains is using the app, a private deploy if you want it on the VPS, and v2 work that must not ship as if it were ready.

## Status

| #   | Capability                                                                                           | State                                       |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | Register and log in with email + password; one account = one user                                    | Done                                        |
| 2   | Verify and reset with a shared **instance code** (env), zero SMTP                                    | Done — private instance only                |
| 3   | Shell: 5 panels + AI bar (off until `AI_ENABLED`)                                                    | Done                                        |
| 4   | Tasks: title, done, description, optional day; CRUD                                                  | Done                                        |
| 5   | Home: **today’s open** tasks (at most 4) + chevron to expand the rest + empty state                  | Done                                        |
| 6   | Tasks panel: all of them, including undated                                                          | Done                                        |
| 7   | Blocks: one row = one id; 24 h week on desktop; one day + week strip on a phone; overnight spans     | Done                                        |
| 8   | Home: nearby-block preview around now (1 h back, ≥3 h forward; desktop matches today’s tasks height) | Done                                        |
| 9   | Repeat: the same block shows on many days; edit/delete everywhere                                    | Done                                        |
| 10  | Notes: markdown cards **with no date**; panel = collection; Home = 4 recent                          | Done                                        |
| 11  | Delete account (Account panel)                                                                       | Done                                        |
| 12  | Responsive web; Docker + HTTPS compose                                                               | Done in repo; VPS not yet a public instance |
| 13  | Assignments: pin a task to a block occurrence; pin a note to a block series                          | Done in API and UI                          |

Pin a task to a block: `date` + `timeBlockId`; the date is a day the block occurs (autofilled from today when omitted). A note pins to the series (`timeBlockId`) with no date, and may also pin to a task (`taskId`) from the note form. A block tile may **show** pinned items and open them; it does not contain a task list inside.

**Ready for a private VPS** when `.env` is filled, DNS points at the box, and you can: create an account, verify / reset with the instance code you keep secret, walk through Home in the morning, lay out the week in Calendar, open all tasks and the notes collection.

**Not ready for a public instance** until verify and reset use per-user email tokens. Product success (separate from deploy): ≥ 20 days of September with a plan in Trium.

## Auth: current vs v2

**Now:** one `INSTANCE_CODE` in env. Empty in development = skip verify (accounts work immediately). Non-empty = the same secret activates an account _and_ resets any password. Cookies: HttpOnly `access_token` (~30 min) and `refresh_token` (rotated, client max-age 10 years). Password reset increments `session_version` and revokes refresh tokens.

**Do not publish the instance code.** Anyone with the code and an email can reset that account.

**v2 (blocker for public open registration):** SMTP plus a stored token per user and purpose (`verify` or `reset`):

- cryptographically random value, hash only in the database;
- short TTL, single use, consumed atomically;
- request/confirm endpoints that do not reveal whether the email exists;
- rate limits per IP and per normalized email, plus a resend cooldown;
- no codes in logs;
- password reset still invalidates every session.

Until that ships, treat production as a trusted instance you operate for yourself (and people you hand the code to on purpose).

Refresh reuse within a short grace window no longer signs out a second tab as a replay. A real server-side refresh-token expiry is still later.

## Later (v2)

| Idea                                           | Condition                                                   |
| ---------------------------------------------- | ----------------------------------------------------------- |
| SMTP + per-user verify/reset tokens            | replaces `INSTANCE_CODE`; **required before public signup** |
| Draw / queue of activities in a block (habits) | optional; stable blocks                                     |
| AI assistant — live bar                        | `AI_ENABLED`; BYOK on Account; preview then REST create     |
| Suggest times from title/description           | do not guess; ask instead                                   |
| Google login                                   | after own email/password                                    |
| Expo / native app                              | after web                                                   |
| Notifications                                  | maybe never                                                 |
| Data export                                    | unsure; does not block MVP                                  |
| Tasks from GitHub                              | does not block the day                                      |
| Edit a single occurrence in a series           | deliberately not this model                                 |

## Out of MVP scope

- Project planner
- Polish UI
- Google OAuth, Expo, SMTP
- Draw inside a block
- Notifications, analytics
- Admin vs user roles
- Drag-and-drop hours onto the grid
- Separate occurrences of a repeating block (calendar exceptions)
- Note pinned to a day
- Change email (`PATCH /api/users/me` is `501`)

## Assumptions

- Instance timezone: **Europe/Warsaw** (until there is a setting on Account).
- Block times are typed in by hand.
- Repeating block: `date` is the anchor (first day / weekday for “weekly”). No series end in MVP (it runs forward).
- Empty: task / note CTA; empty hour window — no dummy data.
- Network / bad data: a message + retry.
- Sync = account + database. The SPA loads full collections and revalidates via `GET /api/state` about every 60 s.
- Home notes: latest by `updated_at`, four cards. Home tasks: open, today, four items, with a chevron to expand the rest.

## Stack

| Layer    | Choice                                                                           |
| -------- | -------------------------------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, Tailwind v4 (phone in the browser)                   |
| Backend  | FastAPI, Python 3.13                                                             |
| Database | PostgreSQL 18, Alembic (head `20260906_0008`)                                    |
| Auth     | email + password (bcrypt) + `INSTANCE_CODE`; cookies; Google and SMTP not in MVP |
| Hosting  | VPS, `docker compose` / `docker-compose.prod.yml`                                |
| CI       | GitHub Actions: ruff + pytest; client lint / test / build                        |
| AI       | User BYOK: OpenAI, Anthropic, Gemini, DeepSeek, xAI; encrypted at rest; off by default |

## Data (as implemented)

```
User          id, email, password_hash, verified_at?, session_version, created_at
UserAiSettings id, user_id, provider, model, key_ciphertext, key_nonce, key_hint,
               is_active, timestamps
               — many keys per user; one is_active at a time
RefreshToken  id, user_id, token_hash, session_version, created_at, revoked_at?, replaced_by_id?
Task          id, user_id, title, description, done,
              date?          — null = Tasks panel only; required when pinned
              time_block_id? — pin to a block occurrence; null = not pinned
              order, created_at, updated_at
TimeBlock     id, user_id, title, description,
              date           — one-off day OR series anchor
              start, end     — times of day; end < start continues into the next day
              recurrence     — none | daily | weekly | weekdays
              recurrence_days, updated_at
Note          id, user_id, title, markdown, updated_at
              (no date)
              task_id?       — optional; independent of the block pin; note form
              time_block_id? — pin to the series; shown on every occurrence
```

Calendar for day D: blocks with `recurrence = none` and `date = D`, plus blocks whose rule hits D (the same `id` rendered on many days). Overnight spill is visible on the next morning.

Home: `Task` with `date = today` and `done = false`, first 4; `TimeBlock` in the window around now (including expanded recurrence); `Note` ORDER BY `updated_at` DESC LIMIT 4.

## Non-functional

| ID  | Topic       | Requirement                                            | Priority    |
| --- | ----------- | ------------------------------------------------------ | ----------- |
| N01 | Performance | list < 500 ms                                          | P0          |
| N02 | Security    | hashed passwords, HTTPS, instance code not in the repo | P0          |
| N03 | Phone       | responsive web                                         | P0          |
| N04 | Privacy     | no tracking; content only the owner’s; delete account  | P0          |
| N05 | Sync        | across devices (with login: yes)                       | de facto P0 |
| N06 | Language    | EN                                                     | P0          |
| N07 | Cost        | own OVH VPS                                            | P0          |

Open registration: rate-limit `/register` (in-process today). No captcha until it hurts. The current limiter is per worker and uses `request.client.host`, so it is not enough for a public box.

## Integrations

| Service    | What for                | MVP                              |
| ---------- | ----------------------- | -------------------------------- |
| Google     | convenient account      | no                               |
| OpenRouter | optional later provider | no; users bring OpenAI, Anthropic, Gemini, DeepSeek, or xAI keys |
| GitHub     | tasks from issues       | no                               |
| SMTP       | reset / verify by email | no (v2; public-instance blocker) |

## Four weeks (done)

| Week | Goal                                                                                | Outcome         |
| ---- | ----------------------------------------------------------------------------------- | --------------- |
| 1    | Docker; email+password; `INSTANCE_CODE`; 5 panels; empty Home + AI disabled         | Shipped         |
| 2    | Tasks: Home (today) + Tasks panel (all)                                             | Shipped         |
| 3    | 24 h Calendar + preview; repeat with the same id; notes collection + recent on Home | Shipped         |
| 4    | HTTPS compose, delete account, empty states, assignments                            | Shipped in repo |

The cut “drop `task_id` on notes” was **not** applied: the column exists from the baseline schema. The cut that still matters is “do not open the instance to strangers on the shared code”.

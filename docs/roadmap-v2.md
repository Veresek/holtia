# Roadmap v2

Work after the September 2026 MVP. [product.md](product.md) keeps the short
product intent. This file is the detail: conditions and acceptance criteria.
The email codes under “Public registration” shipped in October 2026; none of the
rest is shipped.

## Public registration

Open signup no longer depends on an operator secret — verify and reset email a
code to the account’s own address. What still blocks a public box is the rest of
this section.

### SMTP and per-user tokens — shipped (October 2026)

One code per user and purpose (`verify` or `reset`), delivered by mail. Each
criterion and what landed:

- The value is cryptographically random — 6 digits from `secrets`. The database
  stores only a SHA-256 hash.
- TTL is short — 15 minutes by default (`EMAIL_CODE_TTL_MINUTES`). Use is
  single-shot and consumed atomically under a row lock, so two requests cannot
  both succeed with the same code. Five wrong attempts burn it early.
- Request and confirm endpoints do not reveal whether the email exists:
  `POST /auth/send-code` always answers 204, and one generic 400 covers a wrong,
  missing, expired or already-used code.
- Rate limits apply per IP on every auth endpoint, with a per-address cooldown
  (`EMAIL_CODE_COOLDOWN_SECONDS`, 60 by default) before another message is sent.
  The cooldown replaced the planned per-normalized-email counter.
- Codes never appear in logs; the raw value exists only in the mail body.
- A password reset invalidates every session (`session_version`, and refresh
  tokens).
- Retire `INSTANCE_CODE`. Done: the setting, its production check, the Compose
  passthrough and `.env.example` are gone. Development keeps `SMTP_HOST` empty
  so local accounts skip verify; production refuses to start without a sender.

**Accepted when** a stranger can register, verify, and reset without an
operator secret; a used or expired token cannot be reused; a request for an
unknown email looks the same as one for a real account; and the API starts
with no `INSTANCE_CODE`. All of that holds.

Also required before the instance is public:

- A rate limiter shared across processes (Postgres or Redis), replacing the
  in-memory limiter.
- A server-side `expires_at` on refresh tokens. The client max-age is not an
  expiry.
- Change email. `PATCH /api/users/me` with `email` still returns 501.

## Habits and a draw inside a block

A pool of activities pinned to a block. Once a day, one activity is drawn.
Two other shapes of the same block: a queue (in order, not random) and a
block that is one kind of work, with no draw.

Sketch, not a schema commitment:

```
BlockActivity  id, time_block_id, title, position
BlockDraw      id, time_block_id, occurrence_date, block_activity_id
```

The pool hangs on the series, the same way a block is one row. A draw, if we
store one, hangs on an occurrence date.

Open:

- Is a draw stable for that occurrence, so reopening the day shows the same
  activity, or is it rolled again?
- Do we keep a history of past draws, or only the current one?

## AI extensions

The first assistant (bring your own key, preview, then REST create) is in the
MVP. Later:

- Pin proposals to existing blocks.
- Edit, delete, and mark done.
- Repeating blocks, not only one-off events.
- Conversation history.
- Streaming.
- OpenRouter as another provider.
- Suggest times by asking. Do not guess a clock time from a title.

## Data export

- The account as one JSON document (tasks, blocks, notes, and the fields that
  tie them together).
- Notes as markdown files.

## Later

- Google login, after email and password.
- Expo, after the web app.
- Pagination with `ETag`, when full-collection loads stop being enough.
- Tasks from GitHub.

Separate occurrences of a repeating block stay out. That is a different model,
not a later slice of this one.

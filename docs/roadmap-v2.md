# Roadmap v2

Work after the September 2026 MVP. [product.md](product.md) keeps the short
product intent. This file is the detail: conditions and acceptance criteria.
None of it is shipped.

## Public registration

Open signup stays blocked until verify and reset no longer share one
`INSTANCE_CODE`.

### SMTP and per-user tokens

One token per user and purpose (`verify` or `reset`), delivered by email.

- The value is cryptographically random. The database stores only a hash.
- TTL is short. Use is single-shot and consumed atomically, so two requests
  cannot both succeed with the same token.
- Request and confirm endpoints do not reveal whether the email exists.
- Rate limits apply per IP and per normalized email, with a cooldown before
  another message is sent.
- Codes never appear in logs.
- A password reset invalidates every session (`session_version`, and refresh
  tokens).

Also required before the instance is public:

- A rate limiter shared across processes (Postgres or Redis), replacing the
  in-memory limiter.
- A server-side `expires_at` on refresh tokens. The client max-age is not an
  expiry.
- Change email. `PATCH /api/users/me` with `email` still returns 501.
- Retire `INSTANCE_CODE`. Development may keep an empty code so local accounts
  skip verify; production must not depend on a shared secret.

**Accepted when** a stranger can register, verify, and reset without an
operator secret; a used or expired token cannot be reused; a request for an
unknown email looks the same as one for a real account; and the API starts
with no `INSTANCE_CODE`.

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

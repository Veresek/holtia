# AI tools

The assistant is **off by default** (`AI_ENABLED=false`). When an operator
enables it, each user can save one or more OpenAI, Anthropic, Google Gemini,
DeepSeek, or xAI keys on Account and choose which one is in use. The bar at the
top of every signed-in screen opens a panel; the model returns a plan; **nothing
is written until the user confirms**.

Confirmed creates use the same REST API the SPA already uses, as the signed-in
user. OpenAPI at `/docs` is the live schema. Field names on the wire are
camelCase (`timeBlockId`, `recurrenceDays`).

## Rules

- The assistant acts only as the logged-in user. Provider keys are decrypted in
  memory on the server for the upstream call and never returned to the browser.
- The model cannot mutate the database. It may only call `propose_day_changes`.
  After the user clicks **Create items**, the client issues one REST create per
  item (`POST /api/tasks`, `/api/notes`, `/api/blocks`). A later failure does
  not roll back earlier creates.
- First version: create only. No edit, delete, complete, pin, or repeating
  blocks. One-off blocks always send `recurrence: "none"`.
- Ownership is enforced server-side. A foreign or missing id is `404`.
- If the request is unclear (especially missing times), the model asks a
  question and returns no items.

## Plan endpoint

`POST /api/ai/plan` with `{ "prompt": "…" }`. The server adds today’s tasks,
today’s blocks, and recent note titles in the signed-in user’s timezone, then calls the
configured provider with `propose_day_changes`. The response is:

```
{ "reply": "…", "items": [ /* task | note | block */ ] }
```

| kind | Fields | Becomes |
|------|--------|---------|
| `task` | `title`, `description`, optional `date` | `POST /api/tasks` |
| `note` | `title`, `markdown` | `POST /api/notes` |
| `block` | `title`, `description`, `date`, `start`, `end` | `POST /api/blocks` (`recurrence: "none"`) |

`GET /api/state` still returns collection fingerprints so the client can
revalidate after creates.

## Settings

| HTTP | Path | Result |
|------|------|--------|
| `GET` | `/api/ai/settings` | `enabled`, `configured`, active provider/model/hint, `keys`, `activeKeyId`, model catalog |
| `POST` | `/api/ai/keys` | add a key (becomes the one in use) |
| `PATCH` | `/api/ai/keys/{id}` | change provider, model, and/or the secret |
| `DELETE` | `/api/ai/keys/{id}` | remove one key; another saved key becomes active if needed |
| `PUT` | `/api/ai/keys/{id}/active` | choose which saved key the assistant uses |

The raw key is write-only. Responses expose `keyHint` (last four alphanumeric
characters) at most. At most 10 keys per user.

## Assignment invariants

Unchanged for the rest of the app. The first assistant version does **not**
set `timeBlockId` or `taskId`. A task may still include a `date`; a note may
too, but the assistant does not set it. A proposed block is one-off.

## Errors the UI can trust

| Status | Meaning |
|--------|---------|
| `401` | Not authenticated. |
| `404` | AI is disabled on this instance, or the resource does not exist for this user. |
| `400` | No key saved, or the stored key cannot be decrypted. |
| `422` | Validation failed (prompt too long, unknown model, empty prompt). |
| `429` | Assistant rate limit. |
| `502` / `504` | The provider failed or timed out. The message does not include upstream bodies. |

## Deliberately deferred

- Pins, edits, deletes, done toggles, repeating blocks
- A batch endpoint or a natural-language write endpoint
- Conversation history in the database
- Streaming
- OpenRouter as another provider
- `GET /api/day` — existing list endpoints already return the collections

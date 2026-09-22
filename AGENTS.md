# Holtia — agent guide

Holtia is a **command center for the day**: tasks, time blocks, and notes in one
place. It is not a project planner and not a team tool. One maintainer, one
primary user, open source (GPL-3.0), self-hostable.

Read [`docs/product.md`](docs/product.md) and [`docs/execution.md`](docs/execution.md)
before changing product behaviour. Decisions there are locked, not suggestions.
Deploy and secrets: [`docs/operations.md`](docs/operations.md). Current risks:
[`docs/review.md`](docs/review.md).

## Repository layout

```
client/                 Vite + React 19 + TypeScript SPA
  src/
    api/                fetch wrapper (client.ts) + endpoint groups
    assets/icons/       every SVG in the project lives here, nowhere else
    assignments.ts      pins of tasks/notes onto block tiles
    auth/               AuthProvider + route guards
    components/         shared UI (forms, grids, Dialog, EmptyCta, …)
    data/DataProvider   signed-in collections + /state revalidation
    hooks/              useTasks / useNotes / useBlocks / around-now
    layouts/AppShell    sidebar + AI bar + routed outlet
    pages/              one file per route
    styles/globals.css  Tailwind v4 theme tokens
    test/               render helper + jest-dom setup
    types/              shared domain types
server/                 FastAPI + SQLAlchemy + PostgreSQL
  app/
    config.py           pydantic-settings, env-driven
    db.py               engine, session, declarative Base
    models/             SQLAlchemy tables
    schemas/            Pydantic request/response models
    routers/            one router per resource, mounted under /api
    services/           domain logic (auth, recurrence, pins, AI BYOK)
  migrations/           Alembic versions; head is 20260921_0014
  scripts/              migrate.py, purge_revoked_tokens.py
  tests/                pytest + FastAPI TestClient
docs/                   product.md is the source of truth
docker-compose.yml      Postgres 18 + API :8000 + Vite :5173
docker-compose.prod.yml Postgres + API on 127.0.0.1:8001; CD builds client/dist
.github/workflows/ci.yml   ruff + pytest; client lint / test / build
.github/workflows/cd.yml   SSH deploy to the VPS on push to main
```

## Commands

The shell is **PowerShell on Windows**: `&&` is not a valid separator. Chain with
`;` or run commands separately.

```powershell
docker compose up --build          # whole stack: app :5173, API :8000

cd client; npm run lint            # ESLint (includes jsx-a11y)
cd client; npm test                # Vitest (single run)
cd client; npm run build           # tsc --noEmit + production build

cd server; .\.venv\Scripts\python.exe -m ruff check .
cd server; .\.venv\Scripts\python.exe -m pytest
```

Server dependencies live in a local venv at `server/.venv`. Install with
`pip install -r requirements-dev.txt` (it pulls in `requirements.txt`).
Runtime: Python 3.13, Node 24, PostgreSQL 18. CI runs those same checks on
every push and pull request.

## Before you finish

Run the checks for whatever you touched: `npm run lint`, `npm test`, and
`npm run build` for the client; `ruff check .` and `pytest` for the server. Do
not report work as done on an unverified change.

## Design language

The app should feel **forest-like and calm**, like a well-set book page — never
like a generic AI-generated dashboard. Concretely that means:

- Light paper background, ink text, moss green as the only accent.
- No neon accents, no glass/blur, no glow, no heavy shadows, no gradient text,
  no decorative emoji or `✦`-style glyphs in the UI.
- Serif (`font-serif`) for the wordmark and page headings, sans for everything
  else. Restrained radii (`rounded-md` / `rounded-lg`), thin `border-line` rules.
- Empty states are real empty states: dashed border plus a CTA, never fake data.

Use the theme tokens from `client/src/styles/globals.css`; never reintroduce raw
Tailwind palettes like `stone-*` or `lime-*`.

| Token | Use |
|-------|-----|
| `paper`, `paper-deep`, `paper-raised` | page, sidebar, cards |
| `ink`, `ink-soft`, `ink-faint` | primary, secondary, tertiary text |
| `line` | borders and separators |
| `moss`, `moss-hover` | accent, primary buttons, active nav |
| `lichen` | quiet accent, hover borders |
| `rust` | destructive actions and errors |

## Icons and logo

Every SVG lives in `client/src/assets/icons/` as its own file. Do not inline SVG
markup into components and do not add icon dependencies.

- Icons are 24×24, `fill="currentColor"`, and rendered through `Icon.tsx`, which
  inlines them with `?raw` so `text-*` colors apply.
- `logo.svg` is the brand mark: cream tree on a moss square. It is used by
  `Brand.tsx` and as the favicon in `index.html`. `logo.png` is the original
  source art; keep it, do not render it.
- Adding an icon: drop the file in `assets/icons/`, add it to the `icons` map in
  `Icon.tsx`, then use `<Icon name="…" />`.

## Frontend conventions

- Named exports only, `export function Component()`; no default exports.
- Props typed with a local `interface`, no `React.FC`.
- Tailwind utilities in JSX; build conditional class lists with an array plus
  `.join(" ")`, matching `Nav.tsx`. No CSS-in-JS, no component libraries.
- All network access goes through `src/api/`; `apiRequest` throws `ApiError`.
- Domain types live in `src/types`; keep them aligned with the server schemas.
- UI copy is **English**, in sentence case, and uses typographic apostrophes (’).

## Backend conventions

- SQLAlchemy 2 style: `Mapped[...]` with `mapped_column`, UUID primary keys.
- Pydantic v2 schemas in `schemas/`, split into `…Create` / `…Update` / `…Read`;
  `Read` models set `model_config = ConfigDict(from_attributes=True)`. Wire
  names are camelCase via `schemas/base.py`.
- One router per resource, `APIRouter(prefix="/…", tags=["…"])`, mounted on the
  `/api` router in `main.py`.
- Auth, tasks, blocks, notes, state, account deletion, and the AI assistant
  (BYOK settings + plan) are implemented. Do not reintroduce empty-collection
  scaffolding. The remaining stub is `PATCH /api/users/me` with `email`
  (change email), which still raises `501`. Timezone updates on that route
  are implemented.
- Configuration comes from `Settings` in `config.py` only; never read `os.environ`
  directly in feature code.

## Testing

- Server: `server/tests/`, pytest with FastAPI `TestClient`. `conftest.py` points
  the app at in-memory SQLite before importing it, so tests need no database.
- Client: Vitest with jsdom, tests colocated as `*.test.tsx`. Render routed
  components with `renderWithRouter` from `src/test/render.tsx` and query by
  role or visible text, not by class name.
- Cover behaviour a user can observe, not implementation details.

## Scope and safety

- MVP is web-only and ends September 2026. Google login, Expo, and SMTP are v2.
  The AI bar stays off until `AI_ENABLED`; users then bring their own provider
  key. See [docs/ai-tools.md](docs/ai-tools.md).
- Verification and password reset currently use one `INSTANCE_CODE` from env.
  That is a private-instance stand-in. Do not publish the code. v2 replaces it
  with per-user, single-use email tokens. See `docs/execution.md`.
- Never commit `.env`, secrets, or the instance code; `.env.example` documents
  the variables.
- No analytics or tracking, ever.
- Do not add dependencies for problems the existing stack already solves.

## Working with the maintainer

Docs, code, comments, and UI copy are written in English. The maintainer often
writes in Polish — reply in whichever language he used.

Write comments only for constraints the code cannot express. Do not narrate
changes in comments, and do not leave "changed X to Y" notes in the source.

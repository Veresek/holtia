# Holtia client

Responsive React 19 SPA: Vite, TypeScript, React Router, Tailwind CSS v4, and
react-markdown. Authentication, account deletion, Tasks, Calendar, Notes, and
Home’s day review are live. The AI bar is off until the instance sets
`AI_ENABLED`; users then save a provider key on Account.

```powershell
npm ci
npm run dev
```

The development server runs on <http://localhost:5173> and proxies `/api` to
`http://localhost:8000` by default. Set `VITE_API_PROXY_TARGET` to override it.

Checks (the same ones CI runs):

```powershell
npm run lint
npm test
npm run build
```

`npm test` is a single Vitest run. Use `npm run test:watch` while iterating.

## Production build

CD on the VPS runs `npm run build` (Node 24 via nvm) and writes
`client/dist/index.html`. Host nginx serves that directory and proxies `/api`
to `127.0.0.1:8001`. See [`docs/operations.md`](../docs/operations.md).

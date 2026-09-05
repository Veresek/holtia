# Trium client

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

## Production image

`Dockerfile.prod` builds the SPA in a Node 24 stage and copies only `dist/` into
Caddy 2.10. `Caddyfile` serves static assets with an SPA fallback and proxies
same-origin `/api` requests to the private API container. Caddy obtains and
renews HTTPS certificates for the required `DOMAIN` environment variable.

Build and run the complete production stack from the repository root:

```powershell
docker compose -f docker-compose.prod.yml up --build -d
```

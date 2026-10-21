@AGENTS.md

# Project notes

- Personal single-user todo app. Keep the UI minimal; don't add features that add clutter.
- Production is a static Next export served by the Cloudflare Worker in `worker/` (no Next server, no proxy.ts, no server actions). API lives under `/api/*` in the Worker.
- Speed matters: the UI is local-first (`lib/store.ts`). Mutations must apply locally first, then queue a *patch* (only changed fields) for sync.
- Times are epoch ms. All-day tasks store local midnight with `allDay: true`. The Worker runs in UTC; use `shared/time.ts` with the user's time zone (settings table).
- Schema changes: add a new file in `migrations/` (never edit applied ones).
- Checks: `npm run typecheck && npm run lint && npm run build`.
- Deploy: `npm run deploy` (needs `wrangler login`). Secrets via `npx wrangler secret put`.

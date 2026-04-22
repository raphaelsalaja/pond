# pond

One inbox for everything you save across Twitter/X, Instagram, Pinterest, Are.na, and Cosmos.

## Stack

- **`apps/web`** — Next.js 15 (App Router), Drizzle ORM, Neon Postgres, Vercel Blob, Tailwind
- **`apps/extension`** — Chrome MV3 extension that intercepts each site's save/bookmark network call and forwards it to `apps/web`'s `/api/ingest`
- **`packages/schema`** — Drizzle schema + Zod ingest payload, shared by both apps

## Quick start

```bash
pnpm install

# 1. Provision a Neon database and Vercel Blob store, then:
cp .env.example apps/web/.env
# fill in DATABASE_URL, BLOB_READ_WRITE_TOKEN, and POND_INGEST_KEY
# (POND_INGEST_KEY is any random string; the extension uses it to authenticate)

# 2. Generate + run migrations
pnpm --filter @pond/web db:generate
pnpm --filter @pond/web db:migrate

# 3. Run the web app
pnpm dev --filter @pond/web

# 4. Build and load the extension
pnpm --filter @pond/extension build
# then in Chrome: chrome://extensions -> Developer mode -> Load unpacked -> apps/extension/dist
# open the popup, paste your ingest URL + POND_INGEST_KEY, hit Save
```

## How capture works

Each site's content script injects a tiny script into the page's MAIN world that wraps `window.fetch` and `XMLHttpRequest`. When you click save/bookmark on the page, the site fires its own internal API call — the inject script sees it, normalizes the data, and posts a capture event to the extension service worker, which POSTs to `/api/ingest`.

This avoids needing OAuth, public APIs, or app review for any of the five platforms.

## Tradeoffs

- No backfill: only captures going forward.
- Only syncs while the browser is open and the extension is enabled.
- Sites can change internal endpoints; per-site inject scripts are independent so each is swappable in isolation.

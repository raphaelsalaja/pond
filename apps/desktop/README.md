# @pond/desktop

The pond desktop app: a local-first archive that runs in the background,
owns a SQLite index + filesystem library folder, and accepts saves from
the browser extension over `http://127.0.0.1:41610`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Launch Electron + Vite renderer in dev mode |
| `pnpm build` | Build main/preload/renderer into `out/` |
| `pnpm dist:mac` | Build + package macOS DMG (arm64 + x64) |
| `pnpm rebuild` | Rebuild `better-sqlite3` for the current Electron ABI |
| `pnpm db:generate` | Generate Drizzle SQLite migrations |

## On disk

- **App state** (rebuildable): `~/Library/Application Support/pond/` — `index.db`, `config.json`.
- **Library** (source of truth): `~/Pond/My Pond.library/` — per-item `.info` folders, trash, library metadata.
- **Secrets**: macOS Keychain via `keytar` — ingest token, AI Gateway key.

Blow away the index and Pond will rebuild it from the library on next launch.

## Architecture

Writes flow through a single `TransactionExecutor` in main (see `src/main/core/`).
The renderer holds an in-memory Object Pool (`src/renderer/src/pool/`) that
updates synchronously for optimistic UI; disk + DB commit in the background.
See the pond plan doc for the full LSE-inspired design.

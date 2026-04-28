# pond

[![CI](https://github.com/raphaelsalaja/pond/actions/workflows/ci.yml/badge.svg)](https://github.com/raphaelsalaja/pond/actions/workflows/ci.yml)
[![Release](https://github.com/raphaelsalaja/pond/actions/workflows/release-desktop.yml/badge.svg)](https://github.com/raphaelsalaja/pond/actions/workflows/release-desktop.yml)
[![License](https://img.shields.io/github/license/raphaelsalaja/pond)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/raphaelsalaja/pond?sort=semver)](https://github.com/raphaelsalaja/pond/releases)

A local-first archive for everything you save across Twitter/X, Instagram,
Pinterest, Are.na, Cosmos, TikTok, YouTube, and any web article. Nothing
leaves your machine — the app runs as a small menu-bar process, the
browser extension posts captures over `localhost`, and your data lives in
a browsable `~/Pond/<name>.library` folder.

Inspired by two very different pieces of local-first software:

- **Eagle** for the on-disk shape — a portable `.library/` folder with one
  `metadata.json` per item as the source of truth, SQLite as a
  rebuildable index.
- **Linear Sync Engine** for the write path — every mutation is a typed
  `Transaction`, the renderer holds an in-memory Object Pool that updates
  synchronously, disk + DB writes commit atomically in the background,
  undo/redo and crash replay come for free.

## Architecture

```
┌──────────────────────┐          ┌────────────────────────────────────┐
│ Chrome / Firefox     │          │ pond desktop app (menu-bar)        │
│ extension            │          │ ┌──────────────────────────────┐   │
│ ─────────────────────│          │ │ Hono on 127.0.0.1:41610      │   │
│ inject → content     │  HTTPS   │ │ /api/v2/item/add, /item/get, │   │
│ → service worker ────┼──loopback┼→│  /library/info, /pair        │   │
└──────────────────────┘          │ └──────────────────────────────┘   │
                                  │        │                            │
                                  │        ▼                            │
                                  │ TransactionExecutor ───► ~/Pond     │
                                  │        │                            │
                                  │        ▼                            │
                                  │ SQLite index (FTS5 + vec0)          │
                                  │ __transactions (crash replay)       │
                                  │        │                            │
                                  │        ▼                            │
                                  │ Renderer Object Pool (React)        │
                                  └────────────────────────────────────┘
```

## Monorepo layout

```
apps/
  desktop/          Electron app (main / preload / renderer)
  extension/        Chrome / Firefox MV3 extension (WXT)
packages/
  schema/           Drizzle + Zod shared by app and extension
```

## Install

### End users (macOS)

1. Install the app (`pond-<version>-arm64.dmg` or `-x64.dmg`) from the
   [Releases](https://github.com/raphaelsalaja/pond/releases) page, or
   with Homebrew once the cask lands upstream:

   ```
   brew install --cask pond
   ```

2. Install the browser extension from the Chrome Web Store / Firefox
   Add-ons (listing pending) or side-load from `apps/extension` in dev.
3. Open the tray menu → **Copy Pairing Token**, paste it into the
   extension popup. Done.

### Developers

```bash
pnpm install
pnpm --filter @pond/desktop dev        # launch the desktop app
pnpm --filter @pond/extension dev      # hot-reload the extension
```

The desktop app creates `~/Pond/My Pond.library/` on first launch and
generates a random ingest token stored in your keychain. Open the
extension popup, paste the pairing link shown in the tray menu, and
right-click → **Save this page to pond** on any supported site.

## Supported sites

Twitter/X, Instagram, Pinterest, Are.na, Cosmos, TikTok, YouTube, and
any article (Readability extraction via the "Save this page" context
menu).

## Philosophy

- **Your data, your disk.** The library folder is yours — readable by
  Finder, backed up by Time Machine, scriptable from the shell.
- **The DB is disposable.** SQLite is an index rebuildable from disk in
  a single `scanLibrary` pass. Corrupt the file? Delete it, we'll
  rebuild.
- **Undo everything.** Every write is a `Transaction`; Cmd-Z is free.
- **Offline-first.** AI enrichment is an opt-in background job keyed on
  your AI Gateway API key. Without it, you get keyword FTS5 search.

## iOS capture (Apple Shortcut)

The extension is desktop-only, but `POST /api/v2/item/add` works from
anywhere, including an Apple Shortcut over Tailscale if your laptop is
elsewhere.

1. **Shortcuts app → + → "Save to pond"**
2. Add **Get URLs from Input** → type URL
3. **Get Contents of URL**:
   - URL: `http://<your-mac>:41610/api/v2/item/add`
   - Method: POST
   - Headers: `Authorization: Bearer <ingest token from tray>`,
     `Content-Type: application/json`
   - Body (JSON): `{ "source": "article", "sourceId": <URLs>, "url": <URLs> }`
4. Enable **Show in Share Sheet** for URLs.

## Contributing

PRs welcome. Per-site capture scripts live in
`apps/extension/entrypoints/` and are intentionally small — each one is
a tiny `window.fetch` / `XMLHttpRequest` hook that normalises the
payload and forwards it to the content script over `window.postMessage`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup, commit
convention, and PR checklist. By participating you agree to follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a vulnerability? Please don't open a public issue — see
[SECURITY.md](SECURITY.md) for the private disclosure process.

## Changelog

All notable changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © [Raphael Salaja](https://github.com/raphaelsalaja)

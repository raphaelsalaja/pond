# @pond/extension

Browser extension that captures saves from supported sites into your local Pond library, and pushes signed-in cookies when you connect a source.

## Install from a release

1. Download `pond-extension-X.Y.Z.zip` from [GitHub Releases](https://github.com/raphaelsalaja/pond/releases).
2. Unzip the archive.
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode**
5. Click **Load unpacked** and select the unzipped folder (e.g. `chrome-mv3`).

## Install from source

```bash
pnpm install
pnpm --filter @pond/extension zip   # produces .output/*.zip
# or for dev with hot reload:
pnpm --filter @pond/extension dev
```

Load unpacked from `apps/extension/.output/chrome-mv3` while developing.

## Capture

Open Pond once so it can register the native host. On macOS this writes a manifest into each installed browser's native messaging folder. On Windows it registers the host under per-user `HKEY_CURRENT_USER` registry keys for Chrome, Edge, Brave, and other supported browsers. Then:

1. Click the Pond icon in the toolbar to save the current tab, or right-click a page, link, or image → **Save to Pond**.
2. On supported sites, the usual save/bookmark control still sends the item into your library.
3. Session connect happens in the background when Pond is waiting and you open that site signed in.

## Supported sources

See [`docs/supported-sources.md`](../../docs/supported-sources.md) for the full list.

## Scripts

| Script | What it does |
|--------|--------------|
| `pnpm dev` | WXT dev server on port 3001 |
| `pnpm build` | Production build to `.output/` |
| `pnpm zip` | Build + zip for distribution |

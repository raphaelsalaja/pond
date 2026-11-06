# @pond/extension

Browser extension that saves pages, screenshots, and images into your local Pond library, captures what you bookmark on supported sites, and pushes signed-in cookies when you connect a source.

## Install

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/ghigndnldiagchoaifgndleogpkendbc) or [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/desktop%40pond.so/). In Pond, **Browser Extension** in the library menu links to both.

Open Pond once so it can register the native host. On macOS this writes a manifest into each installed browser's native messaging folder. On Windows it registers the host under per-user `HKEY_CURRENT_USER` registry keys for Chrome, Edge, Brave, and other supported browsers. On Linux it writes to the XDG native messaging folders of Chrome, Chromium, Brave, Edge, Vivaldi, Firefox, and Zen, including their Snap and Flatpak locations.

## Use

- Click the Pond icon to open the panel: **Save Page**, **Save Images**, **Capture Region**, **Capture Visible Area**, or **Capture Full Page**.
- After each capture, a window on the page lets you set the name, rating, description, tags, and folders before it saves. Turn off **Ask Where to Save** in settings to save straight away.
- **Save Images** lists every image on the page with size, format, and domain filters. Pick folders and tags for the whole batch in its sidebar.
- **Capture Region** highlights the element under the pointer. Click to snap to it or drag to draw, then move or resize the box and press Enter.
- Right-click a page, link, image, or video to save it, or Alt-right-click an image or link to skip the menu.
- On supported sites, the usual save or bookmark control also sends the item to your library. Likes are optional per source.
- In settings, pick PNG or JPEG screenshots at full or page resolution, match the Library theme or a fixed one, and choose which sources to capture.
- Keyboard shortcuts: `Alt+Shift+P` opens the panel, `Alt+Shift+S` saves the page, `Alt+Shift+I` saves images, `Alt+Shift+R` captures a region. Visible area and full page have no default shortcut.

Session connect happens in the background when Pond is waiting and you open that site signed in. YouTube rotates its session on open tabs, which signs out any copy, so the extension forwards each rotation to the YouTube Account in Pond. Pond's own windows never rotate it.

## Supported sources

See [`docs/supported-sources.md`](../../docs/supported-sources.md) for the full list.

## Support Pond

Pond is free, open source, and made by one person. If the extension saves you time, you can [buy me a coffee](https://buymeacoffee.com/raphaelsalaja), or use **Buy Me a Coffee** at the bottom of the panel.

## Layout

| Path | What it holds |
| --- | --- |
| `entrypoints/background/` | Service worker: captures, screenshots, menus, session connect |
| `entrypoints/hooks.content.ts` | Isolated-world bridge that validates and relays site saves |
| `entrypoints/hooks-main.content.ts` | Main-world hooks that watch each site's save and like requests |
| `entrypoints/gestures.content.ts` | Listens for Alt-right-click and asks the background to save the image or link |
| `entrypoints/overlay.content/` | On-page toasts, details window, region picker, and image picker, in a shadow root |
| `entrypoints/popup/` | Toolbar panel: commands, and settings behind the Settings row |
| `sources/` | One folder per supported site |

## Develop

```bash
pnpm install
pnpm --filter @pond/extension build
```

Load `apps/extension/.output/chrome-mv3` unpacked from `chrome://extensions`, or `apps/extension/.output/firefox-mv3/manifest.json` from `about:debugging`. Unpacked Chromium builds keep a pinned `key`, so their ID matches the native host's allowed origins.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | WXT dev server on port 3001 |
| `pnpm build` | Production builds for Chrome and Firefox in `.output/` |
| `pnpm zip` | Build and zip both browsers for local testing |
| `pnpm zip:store` | Store zips without the pinned `key`, plus the AMO sources zip |
| `pnpm test` | Unit tests |

## Build from source for AMO review

The sources zip holds the workspace packages the extension imports. From its root, with the Node version in `.nvmrc` and pnpm installed:

```bash
pnpm install --filter @pond/extension...
pnpm --filter @pond/extension build:firefox
```

The build lands in `apps/extension/.output/firefox-mv3`.

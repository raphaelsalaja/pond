# Privacy

Pond is a **local-first** application. Your library, index, and preferences live on your computer. Pond does not operate a cloud sync service and does not collect usage telemetry.

## What stays on your machine

- **Library**: `~/Pond/My Pond.pond/` on macOS and `C:\Users\<you>\Pond\My Pond.pond` on Windows (or a location you choose). This is the source of truth for your saves.
- **App state**: `~/Library/Application Support/pond/` on macOS and `%APPDATA%\Pond` on Windows store global preferences and logs. Each Library owns its search index and portable settings.
- **Secrets**: The ingest token and provider API keys use Electron `safeStorage` through macOS Keychain or Windows DPAPI.
- **Pipeline logs**: Diagnostic events are written locally to SQLite and `electron-log` files. They are not sent to Pond or any third party.

## Browser extension

The Pond extension talks to Pond on your computer through native messaging. On Windows, Pond registers its native messaging host for your user account only, under `HKEY_CURRENT_USER` registry keys for Chrome, Edge, Brave, Chromium, Vivaldi, Firefox, and related browsers; it writes nothing to `HKEY_LOCAL_MACHINE`. Saves and session data never leave your machine through Pond's servers. There are no Pond-operated servers in this path.

## Platform sync

When you sync a source (X, Instagram, Pinterest, etc.), Pond uses **your own authenticated browser session** on your machine. Pond does not store your platform passwords on any remote service. Traffic originates from your account and is subject to each platform's terms.

## Agent and enrichments

Enrichments run **on your computer**. Captions, text in images, transcripts, and embeddings use Transformers.js / ONNX locally. Agent uses a key you paste or a local host you run. Pond does not send prompts or library content unless you configure a hosted provider.

## On-device ML

Some features (e.g. local embeddings) run entirely on your computer via Transformers.js / ONNX. No network call is made for those models once downloaded.

## Changes

This policy may be updated as Pond evolves. The canonical copy lives in the [GitHub repository](https://github.com/raphaelsalaja/pond/blob/main/PRIVACY.md).

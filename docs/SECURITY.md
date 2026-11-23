# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.0.x   | Yes       |

## Reporting a vulnerability

If you discover a security issue in Pond, report it responsibly:

1. **Do not** open a public GitHub issue for undisclosed vulnerabilities.
2. Email or DM the maintainer via GitHub: [@raphaelsalaja](https://github.com/raphaelsalaja).
3. Include steps to reproduce, impact, and affected version if known.

We aim to acknowledge reports within a few days and will coordinate disclosure once a fix is available.

## Security model (summary)

### Browser extension

The extension talks to Pond through Chrome native messaging (`so.pond.host`). The browser launches a small host binary that Pond registers; only this extension ID is allowed. On macOS, Pond writes a host manifest into each supported browser's `NativeMessagingHosts` folder. On Windows, Pond writes the manifests under its app data folder and registers them in per-user `HKEY_CURRENT_USER` registry keys, so no administrator rights are needed. The host reaches Pond over a Unix socket on macOS and a per-user named pipe on Windows. Saves and session cookies stay on your computer.

A loopback HTTP API on `127.0.0.1:41610` still exists for debugging. It requires the ingest token.

### IPC

Renderer ↔ main IPC handlers validate the sending frame. Untrusted web content cannot invoke privileged channels.

### Library data

Pond stores Library files, thumbnails, backups, and the search index unencrypted on your computer. Logs, preferences, and files you export are also plaintext. Keep full-disk encryption (FileVault on macOS, BitLocker on Windows) and standard account security on to protect them at rest.

## Best practices for users

- Rotate the ingest token if you suspect it was exposed (menu bar → **Rotate Ingest Token**).
- Pond for Windows is not code-signed unless a release says otherwise. Download the installer only from [official GitHub Releases](https://github.com/raphaelsalaja/pond/releases) and expect a SmartScreen prompt.
- Only load the Pond extension from [official GitHub Releases](https://github.com/raphaelsalaja/pond/releases) or a build you compiled yourself.

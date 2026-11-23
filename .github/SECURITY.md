# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

If you discover a security issue in Pond, report it responsibly:

1. **Do not** open a public GitHub issue for undisclosed vulnerabilities.
2. Email or DM the maintainer via GitHub: [@raphaelsalaja](https://github.com/raphaelsalaja).
3. Include steps to reproduce, impact, and affected version if known.

We aim to acknowledge reports within a few days and will coordinate disclosure once a fix is available.

## Security model (summary)

### Browser extension

The extension talks to Pond through Chrome native messaging (`so.pond.host`). The browser launches a small host binary that Pond registers; only this extension ID is allowed. On macOS, Pond writes a host manifest into each supported browser's `NativeMessagingHosts` folder. On Windows, Pond writes the manifests under its app data folder and registers them in per-user `HKEY_CURRENT_USER` registry keys, so no administrator rights are needed. The host reaches Pond over a Unix socket on macOS and a per-user named pipe on Windows. Saves and session cookies stay on your computer.

The [Local API](https://github.com/raphaelsalaja/pond/wiki/Local-API) listens on `127.0.0.1:41610` unless you turn on LAN access. Every route except `/app/info` requires a token.

### IPC

Renderer ↔ main IPC handlers validate the sending frame. Untrusted web content cannot invoke privileged channels.

### Library data

Pond stores Library files, thumbnails, backups, and the search index unencrypted on your computer. Logs, preferences, and files you export are also plaintext. Keep full-disk encryption (FileVault on macOS, BitLocker on Windows) and standard account security on to protect them at rest.

### Boundaries

Pond stores Library data in plaintext and has no Library password or locked state. The boundaries below protect application access and validate external input.

| Boundary             | Required behavior                                                                                                   | Verification evidence                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Renderer IPC         | Accept trusted senders and validate typed query inputs                                                              | IPC sender and query validation tests            |
| `pond://`            | Resolve media within the permitted Library paths and reject path traversal                                          | Protocol path validation and media storage tests |
| Local HTTP API       | Require the local token and validate requests; retain preview tokens for reviewed mutations                         | HTTP route and operation tests                   |
| MCP                  | Respect configured access capabilities and use reviewed mutation operations                                         | MCP and Agent operation access tests             |
| Agent                | Restrict discoverable operations and review mutations before execution                                              | Agent review and replay-prevention tests         |
| Native host          | Validate framed messages and retain local socket permissions                                                        | Native RPC, framing, and server tests            |
| Auxiliary windows    | Validate the Save before opening, scope control messages to the owning window, and close during Library transitions | Preview-window tests                             |
| Imports              | Validate paths and preserve supported external representations                                                      | Import and package fixtures                      |
| Exports              | Write plaintext packages and files only to the requested export destination                                         | Package and export tests                         |
| Background work      | Stop admission and drain in-flight work before changing the active Library                                          | Library lifecycle, executor, and queue tests     |
| Provider credentials | Keep provider secrets in main and operating system secure storage                                                   | Keychain and provider tests                      |

Run the documented `pnpm check` and `pnpm build` checks. Before signing installers, also run `pnpm --filter @pond/desktop smoke:library-trust`, `pnpm --filter @pond/desktop smoke:offline-release`, and the built desktop smoke using isolated Libraries. The Library trust smoke checks backup manifests and reports password-protected folders in imported Eagle metadata; it does not add folder locking to Pond.

## Best practices for users

- Rotate the Local API Token if you suspect it was exposed (**Settings → Preferences → Integrations → Raycast**), and revoke scoped tokens in **Settings → Local API**.
- Pond for Windows is not code-signed unless a release says otherwise. Download the installer only from [official GitHub Releases](https://github.com/raphaelsalaja/pond/releases) and expect a SmartScreen prompt.
- Only load the Pond extension from [official GitHub Releases](https://github.com/raphaelsalaja/pond/releases) or a build you compiled yourself.

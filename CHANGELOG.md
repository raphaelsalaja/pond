# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open source project hygiene: `LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates, CI workflow,
  Dependabot, husky + commitlint with Conventional Commits.

## [0.1.0] - 2026-04-26

### Added

- Initial release of the desktop app and the browser extension.
- Capture support for Twitter/X, Instagram, Pinterest, Are.na, Cosmos,
  TikTok, YouTube, and generic articles via Readability.
- Local-first library at `~/Pond/<name>.library/` with one
  `metadata.json` per item as the source of truth.
- SQLite index with FTS5 + `vec0`, fully rebuildable from disk.
- TransactionExecutor write path: every mutation is a typed transaction,
  the renderer Object Pool updates synchronously, disk + DB writes
  commit atomically in the background.
- Hono ingest API on `127.0.0.1:41610` with per-install bearer auth.
- Menu-bar tray with pairing token UI.
- Auto-update via `electron-updater` keyed on GitHub Releases.

[Unreleased]: https://github.com/raphaelsalaja/pond/compare/desktop-v0.1.0...HEAD
[0.1.0]: https://github.com/raphaelsalaja/pond/releases/tag/desktop-v0.1.0

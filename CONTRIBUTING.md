# Contributing to pond

Thanks for your interest in contributing! This guide covers everything you
need to get started.

## Prerequisites

- **Node.js** 20+ (enforced via `engines` in `package.json`)
- **pnpm** 10+ (managed via the `packageManager` field — `corepack enable`
  is the easiest path)

The desktop app builds native modules (`better-sqlite3`, `keytar`)
against Electron on first install via
`apps/desktop/scripts/rebuild-native.mjs`. On macOS you'll need Xcode
Command Line Tools (`xcode-select --install`); on Linux the standard
`build-essential` toolchain.

## Setup

```bash
git clone https://github.com/raphaelsalaja/pond.git
cd pond
pnpm install
```

## Development

```bash
# Start everything in dev mode
pnpm dev

# Just the desktop app
pnpm --filter @pond/desktop dev

# Just the extension (WXT, Chrome by default)
pnpm --filter @pond/extension dev

# Build everything
pnpm build

# Typecheck
pnpm typecheck

# Lint
pnpm lint
```

The desktop app creates `~/Pond/My Pond.library/` on first launch and
generates a random ingest token stored in your keychain. Open the tray
menu, copy the pairing token into the extension popup, and you're set.

## Monorepo layout

```
apps/
  desktop/      Electron app (main / preload / renderer)
  extension/    Chrome / Firefox MV3 extension (WXT)
packages/
  schema/       Drizzle + Zod types shared by app and extension
icons/          Local icon set (auto-generated TSX wrappers)
```

If your change spans the desktop app and the extension, check whether
the contract belongs in `packages/schema` first — the shared types are
the source of truth for what crosses the loopback boundary.

## Making changes

1. Create a new branch from `main`.
2. Make your changes.
3. Run `pnpm typecheck && pnpm lint` to verify everything passes.
4. Update `CHANGELOG.md` under `## [Unreleased]` if behavior changed.
5. Open a pull request.

## Commit convention

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/).
A `commitlint` hook enforces this automatically.

Format: `<type>(<scope>): <subject>`

### Types

| Type       | When to use                                                |
| ---------- | ---------------------------------------------------------- |
| `feat`     | Add, adjust, or remove a feature                           |
| `fix`      | Fix a bug                                                  |
| `refactor` | Restructure code without changing behavior                 |
| `perf`     | Performance improvement (special refactor)                 |
| `style`    | Formatting, whitespace, semicolons — no behavior change    |
| `test`     | Add or correct tests                                       |
| `docs`     | Documentation only                                         |
| `build`    | Build tools, dependencies, project version                 |
| `ops`      | Infrastructure, deployment, CI/CD, releases                |
| `chore`    | Maintenance tasks like `.gitignore`, initial commit        |

### Rules

- Use imperative, present tense: "add" not "added" or "adds"
- Do not capitalize the first letter of the description
- No period at the end
- Append `!` after the type for breaking changes:
  `feat!: remove /api/v1 ingest endpoint`

### Examples

```
feat(extension): add tiktok inject script
fix(desktop): handle keychain access denial on macos sequoia
refactor(schema): move ingest contracts into shared package
perf(scan): batch metadata reads when rebuilding the index
docs: explain pairing token flow in the README
build: bump electron to 33
chore: init
```

## Pull requests

- Keep PRs focused — one feature or fix per PR.
- Include a clear description of what changed and why.
- Make sure CI passes before requesting review.
- If your change affects the public ingest API
  (`POST /api/v2/item/add`, `/item/get`, `/library/info`, `/pair`),
  call it out explicitly — these are consumed by the extension and any
  Apple Shortcut a user might have set up.

## Adding a new capture site

The extension's per-site capture lives in
`apps/extension/entrypoints/`. Each site is two files:

- `<site>-inject.content.ts` — runs in the page world. A small
  `window.fetch` / `XMLHttpRequest` shim that pulls the structured
  payload the site already sends to its own API.
- `<site>.content.ts` — runs in the isolated world. Receives the
  payload over `window.postMessage` and forwards it to the desktop app
  over `localhost`.

Look at the existing scripts (twitter, instagram, pinterest, are.na,
cosmos, tiktok, youtube) for the pattern. Keep them small and avoid
DOM scraping where the site has a real API to hook into.

## Releasing (maintainers)

The desktop app is released by tagging:

```bash
git tag desktop-v0.1.1
git push --tags
```

This triggers `.github/workflows/release-desktop.yml`, which builds
signed mac / win / linux artefacts via `electron-builder` and attaches
them to the GitHub Release. Code-signing secrets
(`APPLE_ID`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`,
`CSC_KEY_PASSWORD`) live in repo secrets.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE).

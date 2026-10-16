# Releasing Pond

Pond ships via **GitHub Releases**: signed and notarized macOS `.dmg` and `.zip` files (arm64 + x64) with `latest-mac.yml` for auto-update, a Windows x64 NSIS installer with `latest.yml` for auto-update, and a browser extension `.zip`.

## Version bump

The desktop app, browser extension, and website release metadata ship in lockstep with the `vX.Y.Z` GitHub tag. The release workflow rejects a tag when any value below differs. `@pond/cli` is published independently to npm from `packages/cli/package.json`; a desktop release does not require a CLI bump, and a CLI release does not change the desktop, extension, or website version. Other private workspace package versions are not Pond release inputs.

Update the version string in all of these before tagging:

| File | Field |
|------|-------|
| [`apps/desktop/package.json`](apps/desktop/package.json) | `"version"` |
| [`apps/extension/package.json`](apps/extension/package.json) | `"version"` |
| [`apps/extension/wxt.config.ts`](apps/extension/wxt.config.ts) | `manifest.version` |
| [`apps/website/lib/release.ts`](apps/website/lib/release.ts) | `POND_VERSION` |

Hero and footer read the version from `POND_VERSION`, so they update with that file.

Then refresh the SBOM, which carries the root `package.json` version:

```bash
pnpm sbom:generate && pnpm lint:fix
```

`pnpm sbom` writes JSON that the formatter rewrites, so `pnpm check` fails without the second step.

Commit the bump on `main`.

## Tag and publish

```bash
git tag v1.0.1
git push origin v1.0.1
```

Pushing a tag matching `v*` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which runs these jobs:

1. `draft`: verifies the version in every file listed above, stops if any Apple signing secret is missing, and creates a draft release for the tag unless one exists
2. `macos` and `windows`, in parallel, each uploading into the draft:
   - `macos` runs lint, typecheck, tests, build, and the desktop smoke test, then signs and notarizes the app and uploads the DMGs, zips, and `latest-mac.yml`. It also builds the extension zip and uploads it as `pond-extension-<version>.zip`.
   - `windows` builds the workspace, runs the desktop smoke test, and runs `pnpm dist:win:publish`, which uploads the installer, its blockmap, and `latest.yml`.
3. `publish`: checks that every artifact listed below is attached, then publishes the release, which makes it visible to the updater
4. `homebrew`: updates [`Casks/pond.rb`](Casks/pond.rb) with the release version and DMG checksums

Nothing is public until `publish` runs, so a failed platform build never ships a partial release. To write release notes before it goes live, edit the draft while the workflow runs.

Release tag format must be `vX.Y.Z` (e.g. `v1.0.1`). Notarization usually adds 10 to 15 minutes to the packaging step.

Artifact names (used by the website download links and the updater):

- `Pond-<version>-arm64.dmg`
- `Pond-<version>-x64.dmg`
- `Pond-<version>-arm64.zip`
- `Pond-<version>-x64.zip`
- `latest-mac.yml`
- `Pond-<version>-x64.exe`
- `Pond-<version>-x64.exe.blockmap`
- `latest.yml`
- `pond-extension-<version>.zip`

## Signing

### macOS

The release workflow reads five repository secrets:

| Secret | Value |
|------|-------|
| `CSC_LINK` | Base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD` | Password for that `.p12` |
| `APPLE_ID` | Apple Account email for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that account |
| `APPLE_TEAM_ID` | Developer team ID |

The Developer ID certificate expires on November 14, 2027. Create a new one before then and replace `CSC_LINK` and `CSC_KEY_PASSWORD`.

### Windows

Windows code signing is optional. Add these repository secrets to sign the installer:

| Secret | Value |
|------|-------|
| `WIN_CSC_LINK` | Base64 of the code-signing certificate `.pfx`, or a link to it |
| `WIN_CSC_KEY_PASSWORD` | Password for that certificate |

When `WIN_CSC_LINK` is not set, the `windows` job logs a warning and ships an unsigned installer. Windows SmartScreen may then warn on first run. Auto-update works either way.

## Homebrew

The repository contains a tap-compatible cask at
[`Casks/pond.rb`](Casks/pond.rb). Install it with:

```bash
brew tap raphaelsalaja/pond https://github.com/raphaelsalaja/pond
brew install --cask raphaelsalaja/pond/pond
```

The release workflow updates the version and checksums on `main` after both
macOS artifacts are available.

## Local packaging (without publish)

```bash
pnpm install
pnpm dist:mac   # on macOS
pnpm dist:win   # on Windows
```

Artifacts land in `apps/desktop/dist/`. `dist:win` needs the Visual Studio C++ Build Tools; see [Windows development](CONTRIBUTING.md#windows-development).

To try a pull request without building it, download the unsigned test installers that [`package.yml`](.github/workflows/package.yml) attaches to each run (`Pond-windows-x64`, `Pond-macos`). They are kept for 7 days, are not notarized, and cannot auto-update.

The root command builds the desktop once, then packages `out/**`. Desktop
`dist:*` scripts consume an existing build and do not run Electron/Vite again.

Extension zip:

```bash
pnpm --filter @pond/extension zip
```

## CLI publishing

The `@pond/cli` npm package has an independent release policy from the desktop
app. Before publishing it, run:

```bash
pnpm --filter @pond/cli build
pnpm --filter @pond/cli test
pnpm --filter @pond/cli pack:check
```

Confirm the tarball contains `dist`, `README.md`, and `skill`, and that the
published `pond --version` matches `packages/cli/package.json`.

## Smoke test checklist

Run these before announcing a release:

- [ ] GitHub Release contains versioned arm64 + x64 `.dmg` and `.zip`, `latest-mac.yml`, Windows x64 `.exe` + blockmap, `latest.yml`, and `pond-extension-X.Y.Z.zip`
- [ ] `Casks/pond.rb` contains the release version and DMG checksums
- [ ] `spctl -a -vv /Volumes/Pond/Pond.app` reports `Notarized Developer ID`
- [ ] Fresh Mac: download arm64 DMG → open Pond → it launches without a Gatekeeper prompt
- [ ] Fresh Windows 10/11 x64: run `Pond-X.Y.Z-x64.exe` → Pond installs without administrator rights and launches (SmartScreen may warn if the installer is unsigned)
- [ ] Website Download buttons (Mac, Intel Mac, Windows) hit the new artifacts
- [ ] Open Pond once so it registers the native host (a manifest file on macOS, `HKCU` registry keys on Windows)
- [ ] Load the extension unpacked → click the Pond icon or right-click a page → save appears in Pond
- [ ] Settings → **Check for Updates** → shows "You're on the latest version"
- [ ] Windows: Settings → **Check for Updates** → shows "You're on the latest version"
- [ ] Optional: tag a patch on a fork and confirm auto-update downloads the new build on both platforms

## Notes

- **Local packaging**: `pnpm dist:mac` signs with a Developer ID identity in your login keychain and skips notarization unless the Apple variables are set.
- **Auto-update**: Requires the published `latest-mac.yml` (macOS) or `latest.yml` (Windows) from the release workflow. Dev builds skip the updater.
- **Windows**: The x64 NSIS installer is per-user and installs to `%LOCALAPPDATA%\Programs\Pond`. Windows arm64 stays disabled until its native dependency set is verified on an arm64 runner.
- **Linux**: Builds remain disabled.

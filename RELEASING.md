# Releasing Pond

Pond ships via **GitHub Releases**: signed and notarized macOS `.dmg` and `.zip` files (arm64 + x64) with `latest-mac.yml` for auto-update, a Windows x64 NSIS installer with `latest.yml` for auto-update, and Linux AppImage and deb packages for x64 + arm64 with a merged `latest-linux.yml` for auto-update. The extension zips are attached to the release too, and the `stores` job submits them to the Chrome Web Store and Firefox Add-ons from there, so every release must carry `pond-extension-X.Y.Z-chrome.zip`, `pond-extension-X.Y.Z-firefox.zip`, and `pond-extension-X.Y.Z-sources.zip`.

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
2. `macos`, `windows`, `linux`, and `linux-arm64`, in parallel, each uploading into the draft:
   - `macos` runs lint, typecheck, tests, build, and the desktop smoke test, then signs and notarizes the app and uploads the DMGs, zips, and `latest-mac.yml`. It also builds the store zips for the browser extension and uploads them.
   - `windows` builds the workspace, runs the desktop smoke test, and runs `pnpm dist:win:publish`, which uploads the installer, its blockmap, and `latest.yml`.
   - `linux` (x64 runner) and `linux-arm64` (arm64 runner) build the workspace, run the desktop smoke test, and run `pnpm dist:linux:publish`, which uploads that architecture's AppImage, deb, and blockmaps. Native modules rebuild for the build host, so each architecture packages on its own runner; each job also publishes a single-arch `latest-linux.yml`.
3. `publish`: merges the two single-arch `latest-linux.yml` manifests into one (the updater picks the entry whose URL matches its own architecture), checks that every artifact listed below is attached, then publishes the release, which makes it visible to the updater
4. `stores`: submits the extension zips to the Chrome Web Store and Firefox Add-ons for review. Each store is skipped with a warning until its secrets are set (see [Extension stores](#extension-stores))
5. `homebrew`: updates [`Casks/pond.rb`](Casks/pond.rb) with the release version and DMG checksums

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
- `Pond-<version>-x64.AppImage` and `Pond-<version>-arm64.AppImage` (plus their `.blockmap` files)
- `Pond-<version>-x64.deb` and `Pond-<version>-arm64.deb`
- `latest-linux.yml` (merged by the `publish` job; lists both architectures)
- `pond-extension-<version>-chrome.zip`
- `pond-extension-<version>-firefox.zip`
- `pond-extension-<version>-sources.zip`

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

Sign Windows releases. Antivirus engines such as Bitdefender quarantine unsigned apps and can delete the install. Without signing credentials, the `windows` job logs a warning and ships an unsigned installer. With them, it fails if signing fails, then checks that every `.exe`, `.dll`, and `.node` file carries a valid signature before the release is published.

Sign with [Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/), formerly Trusted Signing. Create a signing account and a public trust certificate profile, then create an app registration with the Artifact Signing Certificate Profile Signer role on that account. Add these repository secrets:

| Secret | Value |
|------|-------|
| `AZURE_TENANT_ID` | Directory (tenant) ID of the app registration |
| `AZURE_CLIENT_ID` | Application (client) ID of the app registration |
| `AZURE_CLIENT_SECRET` | Client secret of the app registration |

And these repository variables:

| Variable | Value |
|------|-------|
| `AZURE_SIGNING_ENDPOINT` | Account endpoint for its region, such as `https://eus.codesigning.azure.net/` |
| `AZURE_SIGNING_ACCOUNT` | Signing account name |
| `AZURE_SIGNING_PROFILE` | Certificate profile name |
| `AZURE_SIGNING_PUBLISHER` | Certificate subject common name, exactly as validated |

`AZURE_SIGNING_PUBLISHER` is written into the update feed. electron-updater refuses updates signed by any other publisher, so don't change it after the first signed release.

If you already hold a `.pfx` certificate, set `WIN_CSC_LINK` (Base64 of the `.pfx`, or a link to it) and `WIN_CSC_KEY_PASSWORD` instead.

A signature gives a new release a known publisher, but reputation still builds per publisher. After publishing, the `virustotal` job scans the installer, `Pond.exe`, and `pond-native-host.exe` with [VirusTotal](https://www.virustotal.com) and lists any detections in its job summary. It needs a `VIRUSTOTAL_API_KEY` secret and never blocks a release. When an engine flags a file, submit it as a false positive to that vendor, such as [Bitdefender](https://www.bitdefender.com/consumer/support/answer/29358/) or [Microsoft](https://www.microsoft.com/wdsi/filesubmission). Engines that time out on the large installer can be rescanned from its report page.

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
pnpm dist:linux # on Linux (packages the host architecture, x64 or arm64)
```

Artifacts land in `apps/desktop/dist/`. `dist:win` needs the Visual Studio C++ Build Tools; see [Windows development](CONTRIBUTING.md#windows-development). `dist:linux` needs a C compiler (for the native host), `fakeroot` (deb), and packages the architecture it runs on. To build for arm64, run it on an arm64 machine, such as Asahi Linux.

To try a pull request without building it, download the unsigned test installers that [`package.yml`](.github/workflows/package.yml) attaches to each run (`Pond-windows-x64`, `Pond-macos`). They are kept for 7 days, are not notarized, and cannot auto-update.

`dist:win` also needs network access to GitHub for the `ffmpeg-static` download at install. Its afterPack gate fails the pack when the native host, sharp, onnxruntime, ffmpeg, or the app icon is missing. `pnpm install` itself only warns when MSVC is absent.

The root command builds the desktop once, then packages `out/**`. Desktop
`dist:*` scripts consume an existing build and do not run Electron/Vite again.

Extension store zips:

```bash
pnpm --filter @pond/extension zip:store
```

`zip:store` omits the manifest `key`, which the Chrome Web Store rejects. The Firefox build also writes a sources zip for AMO review.

## Extension stores

The `stores` job reads these repository secrets:

| Secret | Store |
| --- | --- |
| `CHROME_EXTENSION_ID` | Chrome Web Store item ID |
| `CHROME_PUBLISHER_ID` | Publisher ID from the Developer Dashboard settings |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` | `client_email` and `private_key` from the service account JSON key |
| `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` | AMO API key |

Chrome uses the Chrome Web Store API v2 with a [service account](https://developer.chrome.com/docs/webstore/service-accounts): `pond-publisher` in the `pond-512810` Google Cloud project, linked under Developer Dashboard settings. To rotate it, create a new JSON key in Google Cloud and reset both service account secrets. The Chrome Web Store assigns its own extension ID, set as `CHROME_WEB_STORE_ID` in [`packages/schema/src/native.ts`](packages/schema/src/native.ts). The native host allows both that ID and the pinned unpacked ID.

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

- [ ] GitHub Release contains versioned arm64 + x64 `.dmg` and `.zip`, `latest-mac.yml`, Windows x64 `.exe` + blockmap, `latest.yml`, Linux x64 + arm64 `.AppImage` + blockmap and `.deb`, `latest-linux.yml` (listing both architectures), and the three `pond-extension-X.Y.Z-*.zip` store zips
- [ ] `Casks/pond.rb` contains the release version and DMG checksums
- [ ] `spctl -a -vv /Volumes/Pond/Pond.app` reports `Notarized Developer ID`
- [ ] Fresh Mac: download arm64 DMG → open Pond → it launches without a Gatekeeper prompt
- [ ] Fresh Windows 10/11 x64: run `Pond-X.Y.Z-x64.exe` → Pond installs without administrator rights and launches, and the installer's Properties → Digital Signatures tab shows the publisher
- [ ] Fresh Debian x64 and fresh ARM (Asahi): `sudo apt install ./Pond-X.Y.Z-<arch>.deb` → Pond launches, the browser extension can reach it, and the library works (thumbnails, search, video import)
- [ ] Website Download buttons (Mac, Intel Mac, Windows, Linux, and the ARM links once the first arm64 release is out) hit the new artifacts
- [ ] Open Pond once so it registers the native host (a manifest file on macOS; on Windows the installer writes the `HKCU` keys and Pond writes the manifests they point to)
- [ ] Browser Extension dialog → **Download** next to Chrome → load the Downloads folder unpacked → click the Pond icon or right-click a page → save appears in Pond
- [ ] Settings → **Check Now** opens the update dialog immediately. On the latest build it says Pond is up to date; it does not wait until Settings closes
- [ ] Workspace menu and the macOS application menu → **Check for Updates** run that same check without opening Settings
- [ ] Windows: Settings → **Check Now** opens the same up-to-date dialog
- [ ] Optional: tag a patch on a fork and confirm auto-update downloads the new build on both platforms and both Linux architectures (x64, arm64)

## Notes

- **Local packaging**: `pnpm dist:mac` signs with a Developer ID identity in your login keychain and skips notarization unless the Apple variables are set.
- **Auto-update**: Requires the published `latest-mac.yml` (macOS), `latest.yml` (Windows), or `latest-linux.yml` (Linux, merged x64 + arm64) from the release workflow. Dev builds skip the updater.
- **Windows**: The x64 NSIS installer is per-user and installs to `%LOCALAPPDATA%\Programs\Pond`. Its uninstaller removes the `pond` protocol, native messaging, and login registry entries but keeps the Library. Before publishing, install, update from the previous release, uninstall on a clean machine, and confirm `reg query HKCU\Software\Classes\pond` finds nothing. Windows arm64 stays disabled until its native dependency set is verified on an arm64 runner.
- **Linux**: `linux` and `linux-arm64` package on x64 and arm64 runners respectively. Native modules rebuild for the build host, so each architecture builds on its own runner and the artifact name carries the arch. The `publish` job merges the single-arch `latest-linux.yml` manifests into one; electron-updater selects the entry whose URL matches its own architecture, and the deb upgrades through the system package manager.

# Safari extension

Safari is the one engine that cannot use Pond's native-messaging setup as-is, so the
Safari target differs from Chrome, Brave, Edge, and Firefox in four places.

## Why Safari is different

|                    | Chrome, Edge, Brave, Firefox                                                     | Safari                                                                           |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Native messaging   | `NativeMessagingHosts` manifest + `allowed_origins`, launches `pond-native-host` | `SafariWebExtensionHandler` compiled into a Safari App Extension inside Pond.app |
| Socket             | `~/Library/Application Support/Pond/native.sock`                                 | `~/Library/Group Containers/7VFLYD5292.so.pond/native.sock`                      |
| Context menus      | `contextMenus` namespace                                                         | `menus` namespace                                                                |
| MAIN-world scripts | `world: "MAIN"` since Chrome 111                                                 | `world: "MAIN"` **only since Safari 18**                                         |

The wire protocol does not change. `apps/extension/safari/SafariWebExtensionHandler.swift`
writes the same 4-byte little-endian length prefix and UTF-8 JSON that
`native-host/pond-native-host.c` writes.

## Why a second socket

Safari refuses an extension that isn't sandboxed, and the sandbox blocks `connect()` to a
Unix socket outside the extension's own container, even with a temporary file exception
or `network.client`. The one shared place it may reach is an App Group container. Pond
and the appex both carry the `7VFLYD5292.so.pond` group, and packaged builds of Pond
listen there as well as on the Chrome socket. macOS requires the team ID prefix on a
Developer ID app group, so a build signed by another team needs its own group ID in
`SAFARI_APP_GROUP`, both entitlements files, and the Swift handler.

Pond must ask for the container before it binds the socket. Since macOS 15, app data
protection refuses an unsandboxed app that creates `~/Library/Group Containers/<group>`
itself (`mkdir` fails with EPERM), and it refuses a socket inside a container the appex
created first (`listen` fails with EPERM, and the user sees "Data Access Blocked"). The
Files & Folders setting does not lift it. Calling
`containerURLForSecurityApplicationGroupIdentifier:` admits Pond, so the main process does
that through `app-group.node` (built from `apps/extension/safari/app-group.m`) right
before it listens. Verified on macOS 27.2 with a notarized Developer ID test app: `mkdir`
and `listen` fail without the call, and both succeed after it, whichever side created the
container.

Development builds of Pond run unsigned, have no group entitlement, and skip the Safari
socket. Test Safari against a packaged build.

## Bundle IDs

The appex is `so.pond.desktop.Extension`. macOS only accepts an embedded appex whose
bundle ID starts with the host app's, so it follows `appId` in `electron-builder.yml`.

## Version floor

`entrypoints/hooks-main.content.ts` declares `world: "MAIN"`, which Safari added in 18.
The manifest sets `browser_specific_settings.safari.strict_min_version` to `18.0`, and
Safari 18 runs on macOS 13.5 and later, so the appex targets 13.5. There is no fallback
injector; a script-tag shim would break on strict-CSP sites such as X and TikTok.

## Building

You need Xcode, not only the Command Line Tools, because `safari-web-extension-converter`
ships with the full IDE.

```bash
pnpm --filter @pond/desktop build:safari-extension
pnpm --filter @pond/desktop dist:mac:arm64
```

The first command builds the Safari target with WXT, converts it, compiles the appex
into `apps/desktop/resources/SafariExtension`, and signs it ad hoc with
`apps/extension/safari/extension.entitlements`. The `dist:mac` scripts run it before
electron-builder, which copies the appex to `Contents/PlugIns`. electron-builder never
signs `Contents/PlugIns`, so `apps/desktop/scripts/sign-mac.cjs` re-signs the appex with
the release identity before the app is sealed. Without Xcode the script skips locally
and fails in CI.

The same script compiles `apps/extension/safari/safari-settings.m` into
`safari-settings.node`, the Node-API module behind **Open Safari Settings**, which
electron-builder copies to `Contents/Resources`. Safari answers
`SFSafariApplication.showPreferencesForExtension` only for the main process of the app
that contains the extension. A helper executable gets `SFErrorDomain` error 1
(`SFErrorNoExtensionFound`) for an extension Safari lists, whether it sits in
`Contents/MacOS` or `Contents/Resources`, so Electron's main process loads the module and
makes the call itself. Node-API is ABI-stable, so the module built against the
`node-api-headers` headers needs no rebuild when Electron updates.

Quit any other Pond first, open the packaged app from `apps/desktop/dist`, then enable
the extension in Safari's settings. An ad hoc build also needs **Allow unsigned
extensions** in Safari's Developer settings.

## Site access must be granted before anything runs

Safari does not run a web extension's content scripts on any site until you allow it,
and `<all_urls>` in the manifest does not imply that permission. After enabling the
extension, open **Settings → Extensions → Pond** and allow it for the sites you save
from, or use **Always Allow on Every Website**. Until then the background script loads
and the popup opens, but no content script injects and hooks stay silent.

## What is verified and what is not

Verified on macOS 27.0.1 with Safari 27.0.1 and Xcode 27.1:

- The handler's framing round-trips over a real Unix socket, in both directions.
- A sandboxed, Developer ID-signed process in the app group connects to a socket that
  an unsandboxed process in the same group binds in the group container. The same
  process cannot connect to `~/Library/Application Support`.
- `world: "MAIN"` works: on Pinterest the page's own world holds the `pinterest`
  interceptor with fetch and XHR patched.

Not verified:

- **Source connection.** `entrypoints/background/session.ts` reads cookies for each
  Source domain. Safari's `cookies.getAll` and ITP behave differently from Chromium
  around `HttpOnly` and session lifetime.
- **Full-page capture.** The stitching loop in `entrypoints/background/screenshot.ts`
  depends on `captureVisibleTab` rate limits; Safari's differ.

## Share extension

The Share extension puts Pond in the system Share menu in Safari, Finder, Preview, and
any app with a Share button. It lives in `apps/desktop/share-extension`, and
`apps/desktop/scripts/build-share-extension.mjs` compiles it with `swiftc`. It has no
Xcode project, so the Command Line Tools are enough.

```bash
pnpm --filter @pond/desktop build:share-extension
```

The script builds an arm64 and x86_64 slice, joins them with `lipo`, writes the
`Info.plist` with the bundle ID `so.pond.desktop.Share`, and signs the appex ad hoc with
`share.entitlements` into `apps/desktop/resources/ShareExtension`. The `dist:mac` scripts
run it after the Safari step, electron-builder copies it to `Contents/PlugIns`, and
`sign-mac.cjs` re-signs it with the release identity.

It talks to Pond over the same socket as Safari, in the `7VFLYD5292.so.pond` container,
so it only reaches a packaged, signed Pond. Links go through the `enqueue` request with
the `share:url` trigger. Files never cross the socket: the extension copies each one to
`Share Inbox/<uuid>/` in the container and sends the paths in a `files.import` request.
Pond imports only paths of the form `Share Inbox/<uuid>/<item>`, then deletes each
`<uuid>` folder. A shared folder becomes a Pond folder.

Turn it on in **System Settings → General → Login Items & Extensions → Sharing**. To
check whether macOS registered it, run:

```bash
pluginkit -m -p com.apple.share-services | rg pond
```

macOS registers app extensions only from a signed app, so test against a signed
`dist:mac:arm64` build in `/Applications`.

# Plan 006: Share Links for Saves, Folders, and Canvases

> Executor: Phases 0 and 1 are done. Answer the remaining open questions before Phase 2, then work phase by phase and honor each STOP condition.
>
> Issue: [raphaelsalaja/pond#362](https://github.com/raphaelsalaja/pond/issues/362).
>
> Drift check: `git diff --stat cc3974ffb..HEAD -- apps/desktop/src/main/core/canvases.ts apps/desktop/src/shared/canvas-contracts.ts apps/desktop/src/main/core/export-saves.ts apps/desktop/src/main/core/export-files.ts apps/desktop/src/main/ipc/queries/saves-export.ts apps/desktop/src/main/http apps/website/app/privacy`.

## Status

- Priority: P3
- Effort: XL (L through Phase 3)
- Risk: HIGH. It's the first feature that puts Library content on the internet.
- Category: feature
- Planned at: `cc3974ffb`, 2026-11-27
- Status: IN PROGRESS

| Phase | Scope                                                                 | Status |
| ----- | --------------------------------------------------------------------- | ------ |
| 0     | Decisions, domain language, Share Page manifest v1                    | DONE   |
| 1     | Export Share Page for a Save, a selection, or a Folder (no network)   | DONE   |
| 2     | Share Host (S3-compatible), Create Share Link, Copy, Update, Stop Sharing | TODO   |
| 3     | Expiry, the list of Share Links, link previews, Notifications         | TODO   |
| 4     | Canvases: read-only board viewer                                      | TODO   |
| 5     | Optional: encrypted links, Smart Folders and Saved Views, more hosts  | LATER  |

## Why this is hard

The issue asks for public, read-only links to a Save, a Folder, or a Canvas. A link needs something on the internet to answer it. Pond's promise, on the [privacy page](../apps/website/app/privacy/page.tsx), is "no Pond accounts, no Pond servers, and no analytics". The design has to give people a link without Pond running a server, and it must not quietly break that promise.

The privacy page already uses the pattern this plan relies on: Fish talks to "the AI provider you set up … with your own key, and only when you use it". Sharing can work the same way. Pond uploads a snapshot to storage you own, with your credentials, only when you ask it to.

## Options

| Option | How it works | Privacy | Cost to you | Link lifetime | Revocation | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Static export** | Pond writes a self-contained web page folder (or zip). You upload it anywhere. | Nothing leaves the computer until you move it yourself. | Free | Whatever your host gives | You delete it yourself. Pond can't help. | **Ship first** as the foundation |
| **B. Your own storage bucket** (S3-compatible: Cloudflare R2, Backblaze B2, AWS S3, MinIO, Wasabi) | Pond uploads the same snapshot under an unguessable prefix and gives you the URL. | Content sits in your account. Anyone with the URL can view it. The storage company can read it unless it's encrypted (Phase 5). | Free tiers cover small use. Pay-per-GB egress on AWS S3 can spike if a link spreads, while R2 doesn't charge for egress. Check current pricing before writing the setup copy. | Until it expires or you stop sharing | Pond deletes the objects. CDN copies can last up to the cache time Pond sets. | **Recommended** link path |
| **C. Serve from the desktop through a tunnel** (Cloudflare quick tunnel, Tailscale Funnel, ngrok) | A public URL forwards to a share-only server inside Pond. | Opens a port on your computer to the internet. Pond becomes a public web server. | Free, but needs a third-party binary or account | Only while the computer is awake and Pond is running. Quick-tunnel URLs change on restart. | Instant (stop serving) | Reject for now. Maybe later as a "Live Link" for people already on Tailscale. |
| **D. Peer-to-peer** (WebRTC, IPFS) | Recipients fetch from you directly or from a content network. | WebRTC still needs a signaling server, and IPFS content is public and permanent. | Free | IPFS: forever. WebRTC: only while you're online. | IPFS can't revoke. | Reject. IPFS can't revoke, and WebRTC can't do a plain link. |
| **E. A hosted Pond share service** | Pond runs storage and a viewer at a Pond domain. | Breaks "no Pond servers". Pond would hold other people's media. | Pond pays storage and bandwidth forever. | Pond's policy | Pond deletes | Reject. It breaks the product promise, and Pond would take on abuse, takedown, and moderation work for media scraped from other platforms. |
| **F. Your own share server** (a template you deploy to your own Cloudflare account: Worker + R2) | Same as B, plus a small server you own | Same as B | Free tier for most people | Server-enforced expiry | Instant, enforced by your server | Later (Phase 5). Adds server-side expiry, passwords, and view counts, all in your own account. |

GitHub Pages fails as a host: the backing repository is public and listable, so an unguessable path protects nothing.

## Recommendation

Build **A then B**: one snapshot format and one static viewer. The first output is a folder on disk, and the second is the same folder uploaded to a bucket you own.

- **Snapshots, not live views.** As the issue comment suggests, a Share Link is frozen when you create it. Editing the Library never changes what recipients see. **Update Link** republishes a new snapshot at the same URL, and only when you choose it.
- **Self-contained.** Each snapshot carries its own copy of the viewer (HTML, JS, CSS, and the manifest embedded in the page). Old links keep working when the viewer changes, and nothing loads from a Pond domain or a CDN.
- **Bring your own host.** Credentials go in the OS keychain like provider keys, uploads happen only on an explicit action, and the privacy page says so in the same PR that first uploads anything.
- **Allowlist, not denylist.** The snapshot builder copies only the fields listed under [What gets published](#what-gets-published). Anything new added to a Save later stays private until someone adds it to that list on purpose.

## Domain language

Add these to [AGENTS.md](../AGENTS.md#domain-language) in Phase 0. The bare word "Share" is taken: the existing Share menu item sends an exported file to the system share sheet (`main/lib/native-share.ts`), and Capture metrics count "Shares".

**Share Link**:
A public, read-only snapshot of a Save, Folder, or Canvas that Pond uploaded to your Share Host, reachable by anyone with its unguessable URL. Created with Create Share Link, refreshed with Update Link, removed with Stop Sharing.
_Avoid_: share (alone; that's the system Share menu), public link, published page, export (that's a file you keep)

**Share Host**:
Storage you own where Pond uploads Share Links, set up once in Settings with your own credentials.
_Avoid_: destination (that's a sidebar destination), server, cloud, bucket (as the product word)

**Share Page** (shipped in Phase 1; see AGENTS.md):
The frozen, read-only page itself: `index.html` with the viewer and manifest inlined, plus `media/`. Export Share Page writes one to disk; a Share Link is one uploaded to a Share Host.
_Avoid_: web page (Pond already uses that for a Save of a web page, and "Web Pages" is user-facing copy for those)
_Avoid_: static site, HTML export

## What gets published

Everything goes into one versioned manifest (`SharePageManifestSchema` in `@pond/schema/share-page`, `version: 1`), which becomes a compatibility contract once Phase 1 ships. Saves get opaque per-snapshot ids, never their Library ids.

| | Save | Folder | Canvas |
| --- | --- | --- | --- |
| Always | Title, original URL, Source, author name and handle, date saved, Capture text (post text, link card, quoted item), the Thumbnail, and the Assets as web copies | Folder name and every live Save directly in the folder, each published as a Save, in the folder's current sort | Canvas name, items (notes, text, figures, sections, tables, code, topics, drawings), connectors, and each Save on the board as a Save (with its crop) |
| Off unless you turn it on | Notes, Tags, original-quality files | Same, plus subfolders as sections | Same |
| Never | Inbox state, list kinds (`liked`/`saved`), rating, other Folders, file paths, Library ids, embeddings and captions, Fish chats, cookies, file metadata (EXIF, GPS, camera, video metadata) | Saves in Trash, Smart Folder rules | Saves in Trash (their spot shows "Not shared"), the viewport you last used |

Media handling:

- Images are re-encoded with `sharp` to a web copy (long edge ≤ 2560 px, WebP or JPEG) with metadata removed, plus a card-size copy. Original quality is opt-in, still with metadata removed.
- Videos are remuxed with `ffmpeg-static` using `-map_metadata -1` (no re-encode), with their poster. A size cap applies, and anything larger is shown as its poster with a link to the original.
- Article reader bodies are left out in v1. The viewer never renders HTML from the Library, so v1 publishes a plain-text excerpt only.
- SVG Assets are shown only through `<img>`, where their scripts can't run.

## Architecture

```text
packages/share-page/              # done: static read-only viewer (Vite, React, @pond/theme tokens), one classic script
  src/                            # reads <script type="application/json" id="pond-share">
packages/schema/src/share-page.ts                # done: SharePageManifestSchema
apps/desktop/src/main/core/share-page/            # done: plan.ts (allowlist), stage.ts (media), html.ts, export.ts
apps/desktop/src/shared/share-link-contracts.ts   # Phase 2: ShareLink record, IPC inputs
apps/desktop/src/main/core/share-links/
  hosts/
    index.ts                      # ShareHost interface: check, put, deletePrefix, publicUrl
    folder.ts                     # Export Share Page
    s3.ts                         # S3-compatible (SigV4)
  links.ts                        # create, update, stop, expire; reads and writes share-links.json
apps/desktop/src/main/ipc/queries/share-links.ts
apps/desktop/src/renderer/src/features/share-links/   # dialog, Settings section, menu items
```

- **The manifest is embedded** in `index.html` instead of fetched, so an exported page works when opened from disk (`file://` blocks `fetch`) and on any host without CORS setup.
- **The ShareHost adapter** is justified by a real external dependency with two implementations from Phase 2 on (folder, S3). The test fake implements the same contract, including failure and partial-upload cleanup. No module mocks.
- **Records** live in `share-links.json` in the Library root, next to `canvases/` and `fish.json`, because a Share Link points at Library content and has to move with the Library. Each record holds the id, target (kind and id), host id, URL, created, updated, and expiry dates, publish options, byte count, and status. Host settings (endpoint, bucket, public base URL) live in prefs, and secrets live in the keychain.
- **Uploads run as background work** through the existing transfer-jobs path and show in the Status feed, with progress, cancel, and retry. A failed or cancelled upload deletes its prefix, so a half-published link never answers.
- **The URL** is `https://<public base>/<id>/` with a 128-bit random id (base32, 26 characters). Pond keeps no index page, and the setup check fails if the bucket's public URL lists objects.
- **Headers and page metadata**: `index.html` gets `Cache-Control: no-cache`, media gets `max-age=3600`, and Pond's copy says that removal takes effect "within an hour" for that reason. The page sets `<meta name="robots" content="noindex">` and `<meta name="referrer" content="no-referrer">`, so clicking through to the original post doesn't leak the link URL, plus a strict CSP (`default-src 'self'; img-src 'self' data:; media-src 'self'`), with no inline scripts and no third-party requests.
- **Expiry**: an existing cron sweeps expired links while Pond runs. If Pond is closed when a link expires, the link stays up until Pond next runs, and the dialog copy says so. Phase 3 can add bucket lifecycle rules (expiring prefixes `e1/`, `e7/`, `e30/`) so the host enforces expiry even when Pond never opens again.
- **Canvas viewer**: Canvases render with `@xyflow/react` and item components under `features/canvas/components`, and those read desktop stores. Phase 4 extracts a read-only board renderer that takes plain data into a package, which both the desktop board and the viewer use. Until then a Canvas can't be shared, rather than shipping a flat image that looks like the real thing but doesn't behave like it.

## UI

Following [design principles](../apps/desktop/src/renderer/src/PRINCIPLES.md): one focused job per tray.

- **Create Share Link…** in the Save, Folder, and Canvas context menus, and in the hover-preview Share button's menu next to the existing system Share. It opens a popover anchored to the trigger with the options (notes, tags, original quality, expiry), a size and count preflight ("38 Saves · 212 MB"), and Create. The popover then morphs into the link with Copy Link and progress. Creating the first link on a new Share Host is a rare, significant moment and may get a small flourish.
- If no Share Host is set up, the same popover offers **Set Up Share Host…** (opens Settings) and **Export Share Page…** instead.
- An existing link shows Copy Link, Update Link, and Stop Sharing in the same popover. Stop Sharing confirms first, because recipients lose access.
- **Settings › Share Links**: the Share Host form (provider presets for R2, B2, S3, MinIO, and custom; Check Connection) and every Share Link in this Library with its target, created and expiry dates, size, Copy, and Stop Sharing.
- A failed upload or expiry sweep sends an attention Notification, which clears once it succeeds. Finished uploads go to Other.
- Shown once before the first upload: "Anyone with the link can see what you share, and can copy it. Saves from other sites stay their creators' work."

## Phases

### Phase 0: decisions and contracts

- Settle the open questions below.
- Add the domain terms to AGENTS.md.
- Write `SharePageManifestSchema` v1 and a frozen fixture under `apps/desktop/test/fixtures/compatibility`.

### Phase 1: Export Share Page (first shippable slice)

- `packages/share-page` renders a Save and a Folder grid: images, video with poster, post text, author, Source, and a link to the original. It works from `file://`, in light and dark (following the viewer's system setting), and with reduced motion.
- `plan.ts` and `stage.ts` for Saves and Folders, with metadata stripping.
- **Export Share Page** next to the existing exports, for one Save, a selection, or a Folder. It writes `<name>/index.html` plus files and offers Show in Finder.
- No network, credentials, or privacy page change are needed. People can already drag the folder onto any static host, and the slice builds most of the feature (format, allowlist, media pipeline, viewer) without adding anything that can leak.

STOP if the viewer bundle (gzipped JS and CSS) goes over 150 KB. It's copied into every snapshot, so trim before going further.

### Phase 2: Share Links on an S3-compatible Share Host

- The `ShareHost` interface, `s3.ts`, and Settings › Share Links (host form, keychain secret, Check Connection). Check Connection writes, reads anonymously through the public URL, lists anonymously (which must fail), and deletes a probe object.
- Create Share Link, Copy Link, Update Link (re-stage, upload the new prefix contents, then delete stale objects), and Stop Sharing for Saves and Folders. Upload jobs show in the Status feed.
- Update the privacy page's "Pond connects to" list with your Share Host, only when you create, update, or stop a Share Link.

STOP if S3 support would pull in the full AWS SDK. Use a small SigV4 signer (such as `aws4fetch`) or write one with tests against AWS's published signing examples, and ask before adding anything over 100 KB to the main bundle.

### Phase 3: lifetime and management

- Expiry options (Never, 1 day, 7 days, 30 days), the cron sweep, and the optional lifecycle-rule prefixes.
- The full Share Links list in Settings, the Notifications described above, and an Open Graph image (the card-size Thumbnail) so links unfurl in chat apps.

### Phase 4: Canvases

- Extract a read-only board renderer (items and connectors from plain data) into a package. The desktop Canvas uses it for display, and the editor layers stay in `features/canvas`.
- The viewer gains pan and zoom over the board, and opening a Save on the board shows it like a shared Save.

STOP if the extraction means moving more than about 25 files or changing how the desktop Canvas behaves. Write a separate plan for the extraction first.

### Phase 5: later, each optional

- **Encrypted links**: AES-GCM over the manifest and media, with the key in the URL fragment (`#k=…`), which browsers never send to the server. The Share Host only stores ciphertext. Costs: no link previews, and large videos decrypt in memory.
- Smart Folder and Saved View snapshots (they resolve to their matching Saves at publish time).
- More hosts: WebDAV or SFTP to your own server, and the deploy-your-own share server (option F).

## Verification

- Offline tests for `plan.ts`: notes, tags, file paths, and Library ids never appear in the serialized manifest unless an option includes them. The planner reads a `Pick` of Save fields and builds each manifest field by hand, so a field added to Saves later can't reach a page until someone adds it there.
- `stage.ts` tests check that a JPEG with GPS EXIF and a video with metadata come out without them.
- `ShareHost` contract tests run against the folder host and an in-memory fake with failure injection: a partial upload cleans its prefix, and Stop Sharing deletes everything under it. A live S3 test against MinIO or R2 is opt-in and separate from offline checks, like the source-drift smoke.
- Viewer browser tests cover axe in light and dark, keyboard navigation of the grid, `file://` loading, and the CSP (no inline-script violations).
- PR proof: the dialog flow, plus the shared page in a browser.

## Risks

- **Rights and abuse.** Most Saves are other people's posts. A Share Link republishes their media from your account. Pond can't police that, and it shouldn't try, but the first-use notice and the link to the original keep attribution visible. The work stays off Pond's infrastructure (that was the reason to reject E).
- **Revocation isn't absolute.** Anyone who opened a link may have kept a copy, and CDN caches hold files up to the `max-age`. The copy has to say so plainly.
- **Cost surprises** on hosts that charge for egress. The Share Host form shows a one-line note per preset.
- **Large Folders.** The preflight shows count and size. Folders over 2,000 Saves or 2 GB need a confirmation, and the viewer pages a Folder in chunks rather than all at once.
- **Format lock-in.** Manifest v1 is a public, long-lived format the moment one link exists, so old viewers inside old snapshots must keep working. Self-contained snapshots make that automatic.

## Open questions

1. Are the names **Share Link** and **Share Host** right? (**Share Page** replaced "Web Page", which Pond already uses for Saves of web pages.)
2. What should new links default to for expiry: never, or 30 days?
3. Should notes and tags stay off by default (as proposed)?
4. Is Phase 1 (export only, no link yet) the right first release, or should Phases 1 and 2 ship together so the first release actually produces a link?
5. Which Share Host presets matter most? The plan assumes Cloudflare R2 first, because it doesn't charge for egress.

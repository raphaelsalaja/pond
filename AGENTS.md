# Repository instructions

Before changing code, read [CONTRIBUTING.md](.github/CONTRIBUTING.md), including its [code standards](.github/CONTRIBUTING.md#code-standards).

For PR bodies, screenshots, and clips, read [pull requests](.github/PULL_REQUESTS.md).

For module moves, state ownership, or main/preload/renderer interfaces, read [desktop architecture](apps/desktop/ARCHITECTURE.md). For domain naming, use [Domain language](#domain-language) below. For UI behavior, read [design principles](apps/desktop/src/renderer/src/PRINCIPLES.md).

## UI SDK

UI SDK is used only inside `packages/ui`, and Pond styles its parts itself, so its default `web.css` is not imported. Before using UI SDK, follow the `ui-sdk` skill if it's installed, and read `packages/ui/node_modules/@ui-sdk/react/docs/llms.txt`. To build a new component, also search `packages/ui/node_modules/@ui-sdk/react/docs/core.md` by heading, and read `rendering.md` next to it.

## Shared development runtime

Long-running development and watch processes are shared, user-owned infrastructure.

- Only a chat explicitly designated by the user as the runtime owner may run `pnpm dev`, `pnpm dev:desktop`, `turbo run dev`, or another watch command.
- Assume the development runtime is already running. Use finite checks such as lint, typecheck, test, and build in every other chat.
- If runtime verification is needed, use the existing runtime or tell the user what must be checked. Do not launch another server.
- Use the current development runtime for UI checks. Only open a `dist` build after rebuilding it from the latest working-tree changes.
- Worktree chats must not start a separate runtime. Runtime verification happens from the designated shared checkout.

Use the same documented checks as human contributors. Preserve unrelated working changes. Keep live-network tests separate from offline verification.

## Domain language

A local-first archive of things you saved on the web. Pond runs on your computer (macOS, Windows, or Linux). The browser extension talks to that app. There is no Pond cloud. Use these names in code, copy, and docs.

### Library

**Library**:
The on-disk archive of everything you have saved, plus its index. One Library at a time.
_Avoid_: pond (as a store), vault, collection, database

**Save**:
One item in the Library: a URL, its Capture, files, tags, and ingest state.
_Avoid_: item, bookmark, document, entry, post (as the Library row)

**Split**:
Turning one Save from a multi-image or multi-video post into one Save per image or video. Each keeps the post's Source, author, URL, tags, notes, and Folders, and records which media of the post it holds.
_Avoid_: unbundle, explode, slide (as the Library row)

**Split Post**:
The post a Split came from, found again through the Saves that share its Source and post Source ID. Split Posts lists every post with two or more live Saves, and Show Post opens one in post order.
_Avoid_: gallery collection, album, carousel group

**Group Saves**:
Turning several image or video Saves into one new local Save that holds all their files, in the order you selected them, with their tags, notes, and Folders. The originals move to Trash, and Split undoes it. Not the Group under Smart Folders.
_Avoid_: merge (that's Merge Duplicates), combine (Combine Images joins images into one picture), album

**Asset**:
One original file of a Save, named by its path in the Save's folder and identified by its SHA-256. Thumbnails, posters, avatars, source icons, and article bodies Pond makes for a Save are not Assets.
_Avoid_: attachment, media item, blob

**Duplicate**:
Two Saves Pond pairs because they hold the same content. A pair has one relation: exact (the same files, post, or link), near (every file matches a re-encoded, resized, or trimmed copy), overlap (they share some files), or related (only their content looks alike). Only exact and near Duplicates can be merged. Keep Separate stores the pair and its relation in the Library, and the pair comes back only if newer evidence makes the relation stronger.
_Avoid_: copy, clone, match (as the Library row)

**List kinds**:
Whether you liked or saved that item, or both. Stored on the Save as `liked` and `saved`. Public like and bookmark counts on the Capture are metrics, not this.
_Avoid_: origin, bookmark (as the Library row)

**Capture**:
The canonical snapshot of what a Source page contained: identity, author, media, metrics, and for Twitter and Threads a quoted item and link card.
_Avoid_: ScrapedHarvest, harvest meta, extras, raw scrape, DTO

**Seed**:
A Capture supplied when a Save is enqueued, so harvest can skip a fresh scrape while it is still fresh.
_Avoid_: prefill, stub, partial capture

**Inbox**:
Where Saves waiting for review and Notifications about your library land. Each Save records its own Inbox state: needs review, snoozed until a time, or processed. A Save with no state was never sent to the Inbox. The state is independent of Folders, so filing a Save doesn't process it. Settings choose which capture paths send new Saves here. The Priority tab shows Saves to review and priority Notifications; Other holds updates and finished work. Turning off Priority Inbox lists both together.
_Avoid_: queue, triage folder, unread, Uncategorized (that's Saves with no Folder), notification center, bell

**Notification**:
A stored message in the Inbox about the library rather than a Save: something that needs attention, an announcement, or finished background work. Each one can be read or unread, snoozed, or deleted. Attention clears on its own when the problem it reports goes away.
_Avoid_: alert, notice (that's a one-time first-open dialog), toast (that's a transient message)

**Snooze**:
Hiding a Save or a Notification from the Inbox until a time, when it comes back.
_Avoid_: remind, defer, later

**Tag**:
A label you attach to Saves, optionally in a group.

**Smart Folder**:
A named set of filters that automatically shows matching Saves.

**Group** (under Smart Folders):
A container for Smart Folders, Saved Views, and other Groups. Its filters also apply to everything nested inside it.

**Saved View**:
A named set of filters with a saved layout and sort order.

**Canvas**:
A free-form board in the Library where you arrange Saves from any folder, link them with connectors, and add notes, text, shapes, and drawings. A Save on a Canvas is a reference, so one Save can sit on many Canvases.
_Avoid_: board, whiteboard, moodboard (as the stored object)

**Fish**:
A chat character stored in the Library's `fish.json`, with a name, color, instructions, an optional folder and tag scope, an optional model, and an optional routine. Every chat belongs to one fish. Changes a fish proposes, including routine runs, wait for your review.
_Avoid_: Assistant, agent, bot, fishes

**Routine**:
Standing work a fish runs when new Saves arrive, when Saves arrive in the Inbox, or on a schedule. Each run opens its own chat.
_Avoid_: job, automation, cron

### Sources

**Source**:
A platform Pond can ingest from (Twitter, Instagram, the open web, and the rest of the descriptor list).
_Avoid_: extractor, harvester, adapter, provider, integration (as the platform itself)

**Account**:
A signed-in session on a Source, used to harvest what that session can see.
_Avoid_: pond (legacy), profile, login, identity (as the session)

**Watch**:
A remote list or feed on a Source that Pond keeps importing.
_Avoid_: subscription, follow, pond

**Harvest**:
Turning a URL into a Capture, via a page or a Source API, through your session.
_Avoid_: scrape (as the product word), extract, fetch metadata, refresh (as the Capture step)

**Enqueue**:
Accepting a URL, and optionally a Seed, as a Save in the ingest pipeline.
_Avoid_: import (as the one-URL path), add item, ingest (as the accept step)

**Sync**:
Importing everything an Account or Watch has saved on a Source, as enqueued URLs.
_Avoid_: crawl, backfill (as the product word for this), harvest (as the list walk)

### Desktop and extension

**Native host**:
The local pipe from the browser extension to the desktop app.
_Avoid_: pairing, native messaging (as the product word), HTTP ingest (as the link)

**Ask**:
Turning a natural-language sentence plus the Library’s facets into a search plan and leftover words.
_Avoid_: NL query, compiler, semantic search (as the product word)

**Status feed**:
What is in progress, recent, failing, or syncing, as shown in the toolbar.
_Avoid_: funnel, activity log, queue (as the product word for the whole thing)

**Downloads**:
The page that lists ingest work you can inspect, pause, retry, or cancel: Saves being harvested and files being fetched, plus recent completed ingest.
_Avoid_: queue, pipeline, jobs, activity log

### Cards and folders

**Thumbnail**:
The card image stored next to originals as `{filename}_thumbnail.png`. Set Thumbnail replaces that sidecar. Eagle import keeps Eagle's sidecar name and bytes.
_Avoid_: cover (for the card), custom thumbnail

**Folder Cover**:
The save chosen to represent a folder in the sidebar.
_Avoid_: thumbnail (for this)

### Sharing

**Share Page**:
A frozen, read-only copy of a Save, a selection, or a Folder that opens in any browser: an `index.html` that carries Pond's viewer and its manifest, plus web copies of the media with file metadata removed. It holds only the fields its manifest lists. Notes and tags stay out unless you include them. Export Share Page writes one to disk.
_Avoid_: web page (that's a Save of a web page), static site, HTML export, snapshot (Capture uses that word), share (alone; that's the system Share menu)

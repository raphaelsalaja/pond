# Pond

A local-first archive of things you saved on the web. Pond runs on your computer (macOS or Windows). The browser extension talks to that app. There is no Pond cloud.

## Language

### Library

**Library**:
The on-disk archive of everything you have saved, plus its index. One Library at a time.
_Avoid_: pond (as a store), vault, collection, database

**Save**:
One item in the Library: a URL, its Capture, files, tags, and ingest state.
_Avoid_: item, bookmark, document, entry, post (as the Library row)

**List kinds**:
Whether you liked or saved that item, or both. Stored on the Save as `liked` and `saved`. Public like and bookmark counts on the Capture are metrics, not this.
_Avoid_: origin, bookmark (as the Library row)

**Capture**:
The canonical snapshot of what a Source page contained: identity, author, media, metrics, and for Twitter and Threads a quoted item and link card.
_Avoid_: ScrapedHarvest, harvest meta, extras, raw scrape, DTO

**Seed**:
A Capture supplied when a Save is enqueued, so harvest can skip a fresh scrape while it is still fresh.
_Avoid_: prefill, stub, partial capture

**Tag**:
A label you attach to Saves, optionally in a group.

**Smart Folder**:
A named set of filters that automatically shows matching Saves.

**Group** (under Smart Folders):
A container for Smart Folders, Saved Views, and other Groups. Its filters also apply to everything nested inside it.

**Saved View**:
A named set of filters with a saved layout and sort order.

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

# Pond capture standard

> When adding a new source harvester, capture every field below that
> the source plausibly exposes. Source-agnostic fields go onto
> top-level `IngestPayload` columns; source-specific bits land on
> `raw.<source>` (typed as `RawXxx` in `types.ts` so the renderer can
> feature-detect cleanly).
>
> The on-disk `metadata.json` is the source of truth. The SQLite index
> is rebuildable, so it is fine to capture richer per-source metadata
> in `raw` even when no column exists for it — the renderer can grow
> a UI for it later without a schema migration.

A new harvester PR is "complete" only when the wishlist below has been
walked end to end and every field that the source exposes has been
captured (or marked N/A in the PR description). Cheap, drop-in
additions (a metric the DOM already exposes via `aria-label`) are
table stakes; harder bits (paginated GraphQL, undocumented JSON blobs)
can be deferred but should land as TODOs in the harvester header.

## Capture wishlist

### Identity
- Canonical permalink (the URL the user re-opens)
- Stable per-source id (the `sourceId` we dedup on)
- Upstream URL when the platform re-hosts (e.g. Cosmos pulls from IG)

### Authoring
- Author handle (`@<handle>`)
- Author display name
- Author profile picture URL (Retina sized when available)
- Author profile URL
- Verified flag where applicable

### Body
- Title (headline, capped tight enough that the card doesn't reflow body text)
- Description / caption / body text (capped at 4000 chars)
- Language code (BCP-47 if available)

### Media
- Ordered list of media URLs (`mediaUrls[]`) — first entry is the cover
- Per-item type (`image`, `video`, `gif`, `audio`, `link`)
- Per-item dimensions (`width`, `height`) when in DOM
- Per-item alt text (`altText`) when authored
- Per-item duration in seconds (`durationSec`) for video/audio
- Per-item poster URL (`poster`) for videos
- Original-size variant where the platform allows it (Twitter
  `?name=orig`, IG `original.url`, Pinterest `orig` bucket, …)

### Engagement
- Like / heart / favorite count
- Repost / retweet / share count
- Reply / comment count
- View / play count
- Bookmark / save count (where exposed)

### Timestamps
- Post timestamp (ISO 8601)
- Edited-at timestamp when the platform exposes one
- The user's interaction timestamp — when *they* bookmarked, liked,
  saved on the source. Pond also stamps `savedAt` from the local
  capture moment; both should be preserved when both are knowable.

### Relationships
- Parent thread / reply target id
- Quote-of id (with a small payload describing the quoted post)
- Channel / board / cluster the save lives on
- Conversation id (Twitter) / playlist id (YouTube) / collection id
  (IG)
- Pinned-to / channel-of markers when applicable

### Source-specific extras worth keeping
- **Twitter**: tweet `lang`, `is_quote`, `is_reply`, `is_thread_root`,
  `quoted_tweet` summary, alt text per photo, view count.
- **Instagram**: carousel media-id list, sponsored / branded-content
  flags, location tag, accessibility caption.
- **Pinterest**: board id + title, story-pin gallery, pin type
  (`standard`, `story`, `idea`, `video`), domain attribution.
- **Are.na**: connection count, channel list (id + title + slug),
  block class (`Image`, `Media`, `Link`, `Text`, `Attachment`).
- **Cosmos**: cluster id + title, upstream URL, gallery for IG-imported
  carousels.
- **TikTok**: music attribution (artist + clip title), full-resolution
  no-watermark playable URL when available.
- **YouTube**: video duration, channel id + name, chapter markers,
  caption tracks, publish date.
- **Article (generic OG path)**: site name, JSON-LD schema type,
  reading time when the site exposes it.

## Where each field lands

| Class                | Lands on                                   |
| -------------------- | ------------------------------------------ |
| Source/url/sourceId  | top-level columns on `saves`               |
| title/description    | top-level columns on `saves`               |
| author (handle)      | top-level `saves.author`                   |
| author display name  | `raw.<source>.authorName`                  |
| author avatar URL    | `raw.<source>.authorAvatar` (re-fetched into the save's files[] as `avatar.<ext>`) |
| author URL           | `raw.<source>.authorUrl`                   |
| verified flag        | `raw.<source>.verified`                    |
| post timestamp       | `raw.<source>.publishedAt` (ISO)           |
| user-interaction ts  | `IngestPayload.savedAt` (top level)        |
| language             | `raw.<source>.lang` (or `raw.lang` for source-agnostic OG path) |
| media url list       | top-level `saves.files[]` + `IngestPayload.mediaUrls[]` |
| media alt text       | `raw.<source>.media[i].altText`            |
| media duration       | `raw.<source>.media[i].durationSec`        |
| engagement counts    | `raw.<source>.metrics.{likes,retweets,replies,views,bookmarks,...}` |
| relationships        | `raw.<source>.{conversationId,quotedTweet,channels,...}` |
| source-specific blob | `raw.<source>.<anything else>`             |

> Promote a `raw` field to a top-level column only when (a) it is
> universal across every source we already support, and (b) the
> renderer needs to query/sort/filter on it across all of them. Else,
> keep it on `raw.<source>` and let the renderer feature-detect.

## Reference

- **Type**: `ScrapedHarvest` in `harvest/types.ts` is the lowest
  common denominator. Per-source `meta` blobs are typed as
  `RawTwitter`, `RawInstagram`, etc. — additive, never breaking.
- **Wire**: `IngestPayload` in `packages/schema/src/ingest.ts` is the
  HTTP boundary. New columns require a Zod update; new `raw` keys do
  not (`raw` is `z.unknown()`).
- **Index**: `saves` columns in `packages/schema/src/db.ts` are the
  searchable surface. A `raw` field stays in JSON-blob land until
  someone needs FTS / sort over it.

## Coverage today

A per-source coverage matrix lives in
[`COVERAGE.md`](./COVERAGE.md) — keep it in lock-step with the
harvesters when you add or expand one.

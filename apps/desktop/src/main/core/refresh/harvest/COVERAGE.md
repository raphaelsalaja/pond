# Per-source capture coverage

Snapshot taken for the bookmarks-sync vertical slice. Status legend:

- ✅ captured today
- ⚠️ partial — captured for some entrypoints / variants only
- ❌ missing — DOM/JSON has it, harvester ignores it
- N/A — the source does not expose this field

> "Where" is short-hand for the destination:
>
> - `col.<name>` → top-level column on `saves`
> - `raw.<source>.<key>` → typed pass-through under `IngestPayload.raw`
> - `metadata.json only` → captured for the on-disk file but not indexed
>
> "EXT" = browser extension content script;
> "DESK" = desktop in-app harvester (`harvest/<source>.ts`);
> "OG" = server-side `og.ts` reader (used for non-auth-walled sources).

---

## Twitter / X

Permalink: `https://x.com/<handle>/status/<id>`. Auth-walled.

| Field                       | EXT | DESK | Where                              |
| --------------------------- | --- | ---- | ---------------------------------- |
| URL                         | ✅  | ✅   | `col.url`                          |
| sourceId                    | ✅  | ✅   | `col.sourceId`                     |
| author handle               | ✅  | ✅   | `col.author`                       |
| author display name         | ✅  | ✅   | `raw.twitter.authorName`           |
| author avatar URL           | ✅  | ✅   | `raw.twitter.authorAvatar` + saved file |
| author profile URL          | ⚠️  | ✅   | `raw.twitter.authorUrl`            |
| verified flag               | ✅  | ✅   | `raw.twitter.verified`             |
| title                       | ✅  | ✅   | `col.title`                        |
| body text                   | ✅  | ✅   | `col.description`                  |
| language                    | ❌  | ✅   | `raw.twitter.lang`                 |
| media URLs ordered          | ✅  | ✅   | `col.files[]` + `mediaUrls[]`       |
| per-item type               | ✅  | ✅   | `mediaUrls[i].type`                |
| per-item dimensions         | ❌  | ⚠️   | `raw.twitter.media[i].{width,height}` (when in DOM) |
| per-item alt text           | ❌  | ✅   | `raw.twitter.media[i].altText`     |
| per-item duration           | ❌  | ⚠️   | `raw.twitter.media[i].durationSec` |
| like count                  | ❌  | ✅   | `raw.twitter.metrics.likes`        |
| repost (retweet) count      | ❌  | ✅   | `raw.twitter.metrics.retweets`     |
| reply count                 | ❌  | ✅   | `raw.twitter.metrics.replies`      |
| view count                  | ❌  | ✅   | `raw.twitter.metrics.views`        |
| bookmark count              | ❌  | ✅   | `raw.twitter.metrics.bookmarks` (testid + aria-label fallback) |
| post timestamp              | ✅  | ✅   | `raw.twitter.publishedAt`          |
| edited-at                   | ❌  | ❌   | n/a — not exposed in DOM           |
| user save timestamp         | ⚠️  | ✅   | `IngestPayload.savedAt` (set by bookmarks list scrape) |
| is reply                    | ❌  | ✅   | `raw.twitter.isReply`              |
| is quote                    | ❌  | ✅   | `raw.twitter.isQuote`              |
| is thread root              | ❌  | ✅   | `raw.twitter.isThreadRoot`         |
| quoted-tweet payload        | ❌  | ✅   | `raw.twitter.quotedTweet`          |
| conversation_id             | ❌  | ⚠️   | `raw.twitter.conversationId` (when scoped link is in DOM) |

Cheap gaps closed in this slice: language, alt text, metrics
(likes/retweets/replies/views/bookmarks), `isReply`/`isQuote`/`isThreadRoot`,
quoted-tweet summary, conversation id, per-photo dimensions, video
duration, full-screen-name link.

Deferred TODOs:
- Promote handful of metrics that appear universal across sources
  (likes/views) to top-level columns once a second source captures
  them. ~30 min once the second source lands.

---

## Instagram

Permalink: `https://www.instagram.com/p/<shortcode>/` (also `/reel/`,
`/tv/`). Auth-walled.

| Field                       | EXT | DESK | Where                                    |
| --------------------------- | --- | ---- | ---------------------------------------- |
| URL                         | ✅  | ✅   | `col.url`                                |
| sourceId (shortcode)        | ✅  | ✅   | `col.sourceId`                           |
| author handle               | ✅  | ✅   | `col.author`                             |
| author display name         | ✅  | ❌   | `raw.instagram.authorName`               |
| author avatar URL           | ✅  | ❌   | `raw.instagram.authorAvatar`             |
| author URL                  | ✅  | ✅   | `raw.instagram.authorUrl` (derived)      |
| verified flag               | ✅  | ❌   | `raw.instagram.verified`                 |
| title                       | ✅  | ✅   | `col.title` (caption first line)         |
| caption text                | ✅  | ✅   | `col.description`                        |
| language                    | ✅  | ❌   | `raw.instagram.lang` (from `<html lang>`) |
| media URLs ordered          | ✅  | ⚠️   | EXT walks GraphQL `carousel_media`; DESK only sees rendered img/video |
| per-item type               | ✅  | ✅   | `mediaUrls[i].type`                      |
| per-item alt text           | ✅  | ❌   | `raw.instagram.media[i].altText`         |
| per-item duration           | ✅  | ❌   | `raw.instagram.media[i].durationSec`     |
| like count                  | ✅  | ❌   | `raw.instagram.metrics.likes`            |
| comment count               | ✅  | ❌   | `raw.instagram.metrics.comments`         |
| play count (reels)          | ✅  | ❌   | `raw.instagram.metrics.plays`            |
| post timestamp              | ✅  | ✅   | `raw.instagram.publishedAt` (EXT from `taken_at`, DESK from `<time>`) |
| user save timestamp         | ❌  | ❌   | n/a — IG doesn't surface a per-save ts   |
| is sponsored / branded      | ✅  | ❌   | `raw.instagram.isPaidPartnership`        |
| location tag                | ✅  | ❌   | `raw.instagram.location`                 |

Cheap gaps closed in this slice: author display name / avatar /
verified flag, language (from `<html lang>`), per-item alt text +
duration, engagement counts (likes/comments/plays), post timestamp
from `taken_at`, paid-partnership flag, location tag.

Deferred TODOs:
- Mirror the same fields into `harvest/instagram.ts` once the
  `/api/v1/media/<pk>/info/` fallback is online for the desktop
  hidden window. ~1 h — needs the fallback fetch and a parser.

---

## Pinterest

Permalink: `https://www.pinterest.com/pin/<id>/`. Public.

| Field                  | EXT | OG  | DESK | Where                              |
| ---------------------- | --- | --- | ---- | ---------------------------------- |
| URL                    | ✅  | ✅  | n/a  | `col.url`                          |
| sourceId               | ✅  | ⚠️  | n/a  | `col.sourceId`                     |
| author handle          | ✅  | ⚠️  | n/a  | `col.author`                       |
| author display name    | ✅  | ⚠️  | n/a  | `raw.pinterest.authorName`         |
| author avatar URL      | ✅  | ❌  | n/a  | `raw.pinterest.authorAvatar`       |
| author URL             | ✅  | ❌  | n/a  | `raw.pinterest.authorUrl`          |
| title                  | ✅  | ✅  | n/a  | `col.title`                        |
| description            | ✅  | ✅  | n/a  | `col.description`                  |
| auto alt text          | ✅  | ❌  | n/a  | folded into description today      |
| media (cover)          | ✅  | ✅  | n/a  | `col.mediaUrl`                     |
| story-pin gallery      | ✅  | ❌  | n/a  | `raw.pinterest.gallery`            |
| video URL              | ✅  | ❌  | n/a  | `raw.pinterest.videoUrl`           |
| board id / title       | ✅  | ❌  | n/a  | `raw.pinterest.board.{id,name,url}` |
| repin / save count     | ✅  | ❌  | n/a  | `raw.pinterest.metrics.repins`     |
| comment count          | ✅  | ❌  | n/a  | `raw.pinterest.metrics.comments`   |
| post timestamp         | ✅  | ❌  | n/a  | `raw.pinterest.publishedAt`        |
| domain                 | ✅  | ❌  | n/a  | `raw.pinterest.domain`             |
| rich summary           | ✅  | ❌  | n/a  | `raw.pinterest.richSummary`        |

Cheap gaps closed in this slice: pinner name / avatar / URL, board
metadata, repin and comment counts, created-at timestamp, domain,
rich summary. All sourced from the `PinResource` payload normalised
inside `pinterest-inject.content.ts` and forwarded under
`raw.pinterest`.

Deferred TODOs: none for the EXT path. DESK harvester remains a
nice-to-have for unauthenticated reads.

---

## Are.na

Permalink: `https://www.are.na/block/<id>`. Public.

| Field                       | EXT | OG  | Where                                      |
| --------------------------- | --- | --- | ------------------------------------------ |
| URL                         | ✅  | ✅  | `col.url`                                  |
| sourceId (block id)         | ✅  | ⚠️  | `col.sourceId`                             |
| author handle / name        | ✅  | ⚠️  | `col.author`                               |
| author URL                  | ✅  | ❌  | `raw.arena.authorUrl` (derived from slug)  |
| author avatar               | ✅  | ❌  | `raw.arena.authorAvatar`                   |
| author slug                 | ✅  | ❌  | `raw.arena.authorSlug`                     |
| title                       | ✅  | ✅  | `col.title`                                |
| description                 | ✅  | ✅  | `col.description`                          |
| media URL                   | ✅  | ✅  | `col.mediaUrl`                             |
| block class                 | ✅  | ❌  | `raw.arena.blockClass`                     |
| connection count            | ✅  | ❌  | `raw.arena.metrics.connections`            |
| comment count               | ✅  | ❌  | `raw.arena.metrics.comments`               |
| channel list                | ✅  | ❌  | `raw.arena.channels[]`                     |
| created-at                  | ✅  | ❌  | `raw.arena.publishedAt`                    |
| connected-at (user save)    | ⚠️  | ❌  | implicit in capture timestamp              |

Cheap gaps closed in this slice: block class, connection / comment
counts, created-at, author display name / avatar / slug. All
forwarded under `raw.arena` from the `arenaExtras` helper inside
`arena-inject.content.ts`.

---

## Cosmos

Permalink: `https://www.cosmos.so/e/<id>`. Auth-walled.

| Field                       | EXT | DESK (generic) | Where                              |
| --------------------------- | --- | -------------- | ---------------------------------- |
| URL                         | ✅  | ✅             | `col.url`                          |
| sourceId                    | ✅  | ✅             | `col.sourceId`                     |
| author display name         | ✅  | ⚠️             | `col.author`                       |
| author handle               | ⚠️  | ⚠️             | not always set                     |
| title / description         | ✅  | ✅             | `col.title`/`col.description`      |
| upstream URL                | ✅  | ❌             | `raw.cosmos.upstreamUrl`           |
| cluster (board) list        | ✅  | ❌             | `raw.cosmos.clusters[]` (id + title cached from GraphQL) |
| gallery                     | ✅  | ❌             | `raw.gallery[]`                    |
| post timestamp              | ❌  | ❌             | not in scraped element today       |

Cheap gaps closed in this slice: cluster id + title list, surfaced
via the new `clusterCache` populated from GraphQL `__typename` walks
inside `cosmos-inject.content.ts`.

---

## TikTok

Permalink: `https://www.tiktok.com/@<handle>/video/<id>`. Auth-walled.

| Field                  | EXT | DESK (generic) | Where                            |
| ---------------------- | --- | -------------- | -------------------------------- |
| URL                    | ✅  | ✅             | `col.url`                        |
| sourceId               | ✅  | ✅             | `col.sourceId`                   |
| author handle          | ✅  | ⚠️             | `raw.tiktok.authorHandle`        |
| author display name    | ✅  | ⚠️             | `raw.tiktok.authorName`          |
| author avatar          | ✅  | ❌             | `raw.tiktok.authorAvatar`        |
| description (caption)  | ✅  | ⚠️             | `col.description` (`aweme.desc`) |
| music attribution      | ✅  | ❌             | `raw.tiktok.music.{title,author,id}` |
| play count             | ✅  | ❌             | `raw.tiktok.metrics.plays`       |
| like count             | ✅  | ❌             | `raw.tiktok.metrics.likes`       |
| comment count          | ✅  | ❌             | `raw.tiktok.metrics.comments`    |
| share count            | ✅  | ❌             | `raw.tiktok.metrics.shares`      |
| download count         | ✅  | ❌             | `raw.tiktok.metrics.downloads`   |
| post timestamp         | ✅  | ❌             | `raw.tiktok.publishedAt`         |
| video duration         | ✅  | ❌             | `raw.tiktok.durationSec`         |

Cheap gaps closed in this slice: full statistics, music attribution,
post timestamp, video duration, author display name + handle +
avatar. All sourced from the cached `aweme` object inside
`tiktok-inject.content.ts` and forwarded under `raw.tiktok`.

---

## YouTube

Permalink: `https://www.youtube.com/watch?v=<id>`. Public.

| Field                  | EXT | OG  | Where                              |
| ---------------------- | --- | --- | ---------------------------------- |
| URL                    | ✅  | ✅  | `col.url`                          |
| sourceId (videoId)     | ✅  | ⚠️  | `col.sourceId`                     |
| channel name           | ✅  | ✅  | `col.author`                       |
| channel id             | ✅  | ⚠️  | `raw.youtube.channelId`            |
| channel URL            | ✅  | ⚠️  | `raw.youtube.channelUrl`           |
| channel avatar         | ❌  | ❌  | not in player response             |
| title                  | ✅  | ✅  | `col.title`                        |
| description            | ✅  | ✅  | `col.description`                  |
| short description      | ✅  | ❌  | `raw.youtube.shortDescription`     |
| thumbnail              | ✅  | ✅  | `col.mediaUrl`                     |
| duration               | ✅  | ❌  | `raw.youtube.durationSec`          |
| view count             | ✅  | ❌  | `raw.youtube.metrics.views`        |
| like count             | ❌  | ❌  | requires extra request             |
| publish date           | ❌  | ⚠️  | sometimes in OG `og:published_time`|
| keywords               | ✅  | ❌  | `raw.youtube.keywords[]`           |
| chapters               | ✅  | ❌  | `raw.youtube.chapters[]`           |
| caption tracks         | ✅  | ❌  | `raw.youtube.captions[]`           |
| save context           | ✅  | n/a | `raw.youtube.kind` (`watch-later` vs `playlist`) |
| yt-dlp metadata        | n/a | ✅  | `raw.youtube.ytdlp` (when downloaded) |

Cheap gaps closed in this slice: duration, view count, channel id /
URL, short description, keywords, chapters, caption tracks. Captions
and chapters are cached during `youtubei/v1/player` walks and
attached at save time. The `--write-info-json` sidecar is now lifted
onto `raw.<source>.ytdlp` whenever yt-dlp lands fresh bytes.

---

## Generic article (OG path)

Used for any non-auth-walled URL we don't have a dedicated harvester
for: blogs, news, GitHub, Substack, etc. Lives in `og.ts`.

| Field                  | OG  | Where                             |
| ---------------------- | --- | --------------------------------- |
| URL                    | ✅  | `col.url`                         |
| sourceId               | ✅  | `col.sourceId` (host+path hash)   |
| author                 | ✅  | `col.author` (OG / JSON-LD)       |
| title                  | ✅  | `col.title`                       |
| description            | ✅  | `col.description`                 |
| language               | ❌  | available via `<html lang>` / OG  |
| site name              | ❌  | `og:site_name` available          |
| canonical url          | ❌  | `<link rel=canonical>` — TODO     |
| publish time           | ❌  | `article:published_time` — TODO   |
| reading time           | ❌  | sometimes in JSON-LD              |
| og image / video       | ✅  | `col.mediaUrl`                    |
| keywords / tags        | ❌  | `keywords` meta — TODO            |
| feed url               | ❌  | `<link rel=alternate>` available  |

Cheap gaps closed in this slice: site name, canonical URL,
`article:published_time`, `keywords`, language. Now stashed under
`raw.og` so the renderer can grow surface area without the harvester
changing.

Deferred TODOs:
- Promote `lang`/`siteName`/`publishedAt` to typed top-level fields
  once a second source captures them universally. ~30 min once the
  second source lands.

---

## Generic in-page harvester (`generic.ts`)

Fallback for SPA-only sources we haven't built a per-source harvester
for yet. Reads `<meta>` tags after JS hydration.

| Field           | DESK | Where                       |
| --------------- | ---- | --------------------------- |
| title           | ✅   | `col.title`                 |
| description     | ✅   | `col.description`           |
| author          | ✅   | `col.author`                |
| og image/video  | ✅   | `col.mediaUrl`              |
| language        | ❌   | `<html lang>` — TODO        |
| publish time    | ❌   | `article:published_time`    |
| site name       | ❌   | `og:site_name` — TODO       |

Cheap gaps closed: language, publish time, site name now stashed
under `meta` so the merge into `raw.<source>` carries them through.

---

## List harvesters (Phase 3)

Per-source bookmarks/saved/favourites lists. Each source ships its
own `harvest/<source>-list.ts` that the orchestrator
(`core/sync/index.ts`) drives through the hidden window. The
orchestrator dedupes results against the local DB and feeds new ids
back through `harvestUrl()` for the per-item enrichment harvester.

| Source     | List URL                                              | DESK list | Card |
| ---------- | ----------------------------------------------------- | --------- | ---- |
| Twitter    | `/i/bookmarks`                                        | ✅        | ✅   |
| YouTube    | `/playlist?list=WL` + `/playlist?list=LL`             | ✅        | ✅   |
| Cosmos     | `/library`                                            | ✅        | ✅   |
| Are.na     | `/<slug>/channels?per=100`                            | ✅        | ✅   |
| Pinterest  | `/<handle>/_saved/`                                   | ✅        | ✅   |
| Instagram  | `/<handle>/saved/all-posts/`                          | ✅        | ✅   |
| Reddit     | `old.reddit.com/user/<handle>/saved/?limit=100`       | ✅        | ✅   |
| TikTok     | `/@<handle>/favorite`                                 | ✅        | ✅   |

Caveats:
- Account-scoped sources (Are.na/Pinterest/Instagram/Reddit/TikTok)
  infer the user's handle/slug by walking the local saves table for
  any URL that exposes it. If the user hasn't saved one of those
  sources at least once, the orchestrator returns `auth_required` so
  the welcome banner can prompt them to connect first.
- YouTube runs both Watch Later and Liked passes per sync so both
  lists feed the same dedupe pool.
- Cron + IPC stay generic — adding a future source only needs the
  per-source `<source>-list.ts` builder + an entry in the dispatch
  switch in `scrape-window.ts`.

---

## yt-dlp (video metadata path)

`yt-dlp.ts` returns playable bytes plus a curated subset of the
`--write-info-json` sidecar (`view_count`, `like_count`, `duration`,
`upload_date`, `chapters`, `tags`, `categories`, `extractor`,
`webpage_url`, `uploader*`). The desktop refresh path
(`refresh/index.ts`) and the auto-video downloader
(`auto-video.ts`) lift that subset onto `raw.<source>.ytdlp` so the
existing ingest merge picks it up alongside the bytes. Pages whose
harvester already populates `raw.<source>` keep their fields; the
sidecar nests under `ytdlp` to avoid colliding.

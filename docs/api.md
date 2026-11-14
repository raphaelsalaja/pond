# Local API

Pond runs an HTTP API on your Mac while the app is open. Raycast, the `pond` CLI, and your own scripts use it to read and edit your library. It listens on loopback only, so nothing outside your Mac can reach it.

```text
http://127.0.0.1:41610/api/v2
```

To save from Shortcuts without a token, use a `pond://save` link instead. See [Shortcuts](shortcuts.md).

The TypeScript client lives in [`packages/api`](../packages/api) and is published as `pond-api`. Every endpoint below has a method on `PondApi`, and each response is validated against the schemas in [`packages/schema/src/api.ts`](../packages/schema/src/api.ts).

## Authentication

Send a token as a Bearer header on every request except `/app/info`:

```sh
curl -H "Authorization: Bearer $POND_TOKEN" \
  http://127.0.0.1:41610/api/v2/library/info
```

Pond accepts two kinds of token:

- **Scoped tokens** are for your own scripts and apps. Create one in **Settings → Local API** (`pond://settings/local-api`), pick what it can reach, and copy it. Pond shows it once and keeps only a hash. Revoke it there when the tool no longer needs access. Scoped tokens start with `pond_`.
- **The Local API Token** reaches every route, including the private ones below. Raycast uses it. Copy it from **Settings → General → Raycast** (`pond://settings/general`). Rotating it invalidates the old one immediately.

After more than 10 failed attempts from one address within five minutes, Pond answers `rate_limited` until that window ends.

### Access

Each scoped token has one or more of these. A request outside them gets `forbidden`.

| Access | Routes |
| --- | --- |
| Search Saves | `GET /library/info`, `/library/tags`, `/library/folders`, `/library/views`, `/library/sources`. `POST /library/query`, `/library/search`. `/saves/get`, `GET /saves/info`, `/saves/text`, `/saves/status`, `/saves/thumb`, `/saves/file`, `/saves/related`. |
| Export Files | Every `/library/conversion` route. |
| Add and Edit Saves | `POST /enqueue`, `/saves/tags`, `/saves/folders`, `/saves/trash`, `/saves/restore`, `/saves/note`, `/saves/rating`, `/saves/favorite`. |

These routes are private. Only the Local API Token reaches them, and they may change between minor versions:

- `/operations`, which reaches nearly every action in the app.
- `/library/recent` and `/library/switch`.
- `/session/*`, which the browser extension uses to hand Pond a signed-in session.

## Responses

Every JSON response is an envelope. Success carries `data`:

```json
{ "status": "success", "data": { "id": "01J…", "created": true } }
```

Failure carries a stable `code` and a message you can show to a person:

```json
{
  "status": "error",
  "error": { "code": "save_not_found", "message": "No Save has the id 01J…." }
}
```

Branch on `code`, never on `message`. Messages may change between releases.

| Code | Status | Meaning |
| --- | --- | --- |
| `invalid_json` | 400 | The body isn't valid JSON. |
| `unauthorized` | 401 | The token is missing, wrong, or revoked. |
| `forbidden` | 403 | The token doesn't have access to that route. |
| `not_found` | 404 | The route or file doesn't exist. |
| `save_not_found` | 404 | A Save id doesn't exist in the active library. |
| `no_thumbnail` | 404 | The Save has no image to show. |
| `folder_not_found` | 404 | A folder id doesn't exist. |
| `operation_not_found` | 404 | The operation name isn't in `/operations`. |
| `stale_cursor` | 409 | The sort or filter changed since the cursor was issued. Start from page one. |
| `library_mismatch` | 409 | The request named a `libraryId` that isn't the active library. |
| `stale_preview` | 409 | An operation preview token expired or belongs to other arguments. |
| `library_unavailable` | 409 | The library to switch to can't be opened. |
| `invalid_request` | 422 | The body or query failed validation. The message names the field. |
| `operation_failed` | 422 | An operation ran and refused the input. |
| `unsupported_url` | 422 | `/enqueue` can't save that URL. |
| `rate_limited` | 429 | Too many requests from this address used a wrong token in the last 5 minutes. Valid tokens still work. |
| `internal` | 500 | Pond hit an unexpected error. |

New codes may appear in minor versions. Treat an unknown code by its HTTP status.

## Versioning

`GET /app/info` returns `apiVersion`, currently `2.3.0`. Within `/api/v2`:

- Minor versions add endpoints, optional request fields, response fields, and error codes.
- Nothing is removed or renamed, and no field changes type.
- A breaking change ships under `/api/v3`, with `/api/v2` kept alongside it for at least one release.

The promise covers the routes in [Access](#access) and the MCP tools below. Private routes can change in any release.

Ignore response fields you don't recognize. Pond builds before 2.1 don't send `apiVersion` and return errors as a bare string. Builds before 2.2 don't accept scoped tokens. Builds before 2.3 don't send `favorite` or accept `/saves/favorite`.

## Libraries

You can keep several libraries, but only one is active at a time. Every list and query response includes the active `libraryId`. Pass it back as `libraryId` on later requests to pin them: if you switched libraries in between, Pond answers `library_mismatch` instead of editing the wrong library.

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/library/info` | `libraryId`, `path`, `name`, counts of active, trashed, ingesting, and failed Saves, and the capture queue. |
| `GET` | `/library/recent` | Recent libraries, with which one is active. |
| `POST` | `/library/switch` | Switches to `{ "path" }`. Pond relaunches into it. |
| `GET` | `/library/tags` | `{ name, count, starred }`, most used first. |
| `GET` | `/library/folders` | `{ id, name, parentId, color, count }`. `count` excludes subfolders. |
| `GET` | `/library/views` | Saved views and smart folders, with their filter `query` and sort. |
| `GET` | `/library/sources` | `{ source, count }` for each source with live Saves. |

Counts leave out trashed and skipped Saves.

## Finding Saves

### Query

`POST /library/query` runs the same filter engine as the library grid. Every field is optional:

```json
{
  "keywords": "brutalist",
  "scope": { "source": "twitter", "folderIds": ["01J…"] },
  "sortKey": "savedAt",
  "sortDir": "desc",
  "limit": 50,
  "include": ["saves"]
}
```

- `query` takes a filter group, the same shape a saved view stores.
- `scope` narrows by source, folders, tag, untagged, uncategorized, Trash (`deletedOnly`), Save ids, or `savedSince` (epoch ms).
- `keywordScopes` limits keyword matching to fields like `title`, `tags`, or `notes`.
- `limit` is 1 to 500.

The response has `ids`, `total`, `libraryId`, and `nextCursor`. With `include: ["saves"]`, it also has `saves` in the same order as `ids`, so you don't need a second request.

Pass `nextCursor` back as `cursor` for the next page. `nextCursor` is `null` on the last page. Cursors are keyset positions, so saving or editing between pages doesn't skip or repeat rows. Changing the sort or filters invalidates them with `stale_cursor`.

### Search

`POST /library/search` ranks Saves by meaning as well as keywords, the same way Fish searches:

```json
{ "query": "red posters with big type", "limit": 20 }
```

Optional `source`, `folderId`, and `kinds` narrow it. The response is `{ libraryId, saves }`, best match first.

### Related

`GET /saves/related?id=…&limit=12` returns Saves that look or read like this one. `limit` is 1 to 50.

## Reading Saves

| Method | Path | Returns |
| --- | --- | --- |
| `GET`, `POST` | `/saves/get` | Saves by `ids`, `source`, or page (`limit` up to 1000, `offset`). Add `includeDeleted` for Trash. |
| `GET` | `/saves/info?id=` | One Save, including trashed ones. |
| `GET` | `/saves/text?id=` | The title, description, note, caption, text in images, and transcript. |
| `GET` | `/saves/status?ids=a,b` | Capture state for up to 1000 Saves. |
| `GET` | `/saves/thumb?id=&size=` | Image bytes. |
| `GET` | `/saves/file?id=&index=0` | The original file, streamed. |

### The Save shape

```json
{
  "id": "01J…",
  "libraryId": "c0ffee…",
  "source": "twitter",
  "url": "https://x.com/…",
  "title": "…",
  "description": null,
  "author": "…",
  "siteName": "X",
  "tags": ["posters"],
  "folderIds": ["01J…"],
  "note": null,
  "rating": 4,
  "favorite": false,
  "kind": "image",
  "status": "complete",
  "savedAt": 1761091200000,
  "publishedAt": null,
  "deletedAt": null,
  "media": { "files": 1, "width": 1200, "height": 1600, "duration": null, "bytes": 482113 },
  "thumbnail": true,
  "text": { "caption": false, "ocr": true, "transcript": false }
}
```

Times are epoch milliseconds. `status` is `ingesting`, `complete`, `failed`, or `skipped`. `favorite` is separate from `rating`. `thumbnail` tells you whether `/saves/thumb` will return an image. `text` tells you which extracted text exists, so you only call `/saves/text` when there's something to read.

### Thumbnails

`size` is `small` (160px wide), `medium` (480px), `large` (1024px), or `original`. Sized thumbnails are WebP, generated once and cached. `original` returns the cover image as stored and only works for images.

Responses carry an `ETag`. Send it back as `If-None-Match` to get `304 Not Modified` when the image hasn't changed.

### Capture status

`/saves/status` returns, for each Save that exists:

```json
{
  "id": "01J…",
  "status": "ingesting",
  "deleted": false,
  "pendingTasks": 2,
  "failedTasks": 0,
  "thumbnail": false,
  "text": { "caption": false, "ocr": false, "transcript": false }
}
```

Poll it after `/enqueue` until `status` leaves `ingesting` and `pendingTasks` is 0.

## Saving

`POST /enqueue` saves a URL:

```json
{ "url": "https://x.com/…", "trigger": "raycast" }
```

The response is `{ id, created, status }`. `created` is `false` when the URL was already in your library. `unsupported_url` means Pond can't save that URL.

## Editing Saves

Each write takes up to 1000 Save ids and an optional `libraryId`. Pond checks every id first and changes nothing if one is missing. Edits run through the same path as edits you make in Pond, so open windows update right away. Tag, Trash, note, rating, and favorite edits can be undone in the app.

| Path | Body |
| --- | --- |
| `/saves/tags` | `{ "ids", "add": [], "remove": [] }` |
| `/saves/folders` | `{ "ids", "add": [], "remove": [] }` with folder ids |
| `/saves/trash` | `{ "ids" }` |
| `/saves/restore` | `{ "ids" }` |
| `/saves/note` | `{ "id", "note" }`. `null` clears the note. |
| `/saves/rating` | `{ "ids", "rating" }`, 0 to 5. 0 clears the rating. |
| `/saves/favorite` | `{ "ids", "favorite" }`. `false` removes the favorite. |

All of them use `POST` and return `{ "changed": n }`, the number of Saves that actually changed.

## Operations

Operations are the same actions Fish and the MCP server use, like creating folders or copying a file. They're private: only the Local API Token reaches them, and names follow the app's internals, so they can change in any release.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/operations` | Each operation's name, description, access, and JSON Schema input. |
| `POST` | `/operations/preview` | `{ "operation", "arguments" }`. Returns a short-lived `token`. |
| `POST` | `/operations/run` | `{ "operation", "arguments", "token" }`. |

`read` operations run without a preview. `review` operations need the token from a preview with the same arguments, or Pond answers `stale_preview`.

## Conversion

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/library/conversion/capabilities` | Formats this Mac can convert between. |
| `GET`, `POST` | `/library/conversion/presets` | Read or save presets. |
| `POST` | `/library/conversion/start` | Convert Saves. Returns a job. |
| `POST` | `/library/conversion/compress` | Compress images. Returns a job. |
| `GET` | `/library/conversion/:id` | Job progress. |
| `POST` | `/library/conversion/:id/cancel` | Cancel a job. |

## App

`GET /app/info` needs no token. It returns `name`, `version`, `platform`, `arch`, and `apiVersion`. For loopback callers, it also returns the `mcp` command that connects an MCP client to Pond.

## MCP server

Pond also runs as a Model Context Protocol server over stdio, for agents like Cursor and Claude. Copy the command from **Settings → Model Context Protocol**, or read it from `/app/info`. It needs no token: the switches under **Access** on that page decide which tools answer.

| Access | Tools |
| --- | --- |
| Search Saves | `query_library`, `search_library`, `read_save`, `grep_library`, `list_folders` |
| Open in Pond | `open_save`, `apply_filter` |
| Export Files | `list_conversion_capabilities`, `list_conversion_presets`, `save_conversion_preset`, `start_conversion`, `compress_images`, `conversion_status`, `cancel_conversion` |

- `query_library` takes the same body as `POST /library/query` and returns ids with a cursor.
- `search_library` ranks by meaning and keywords. Pass `saveId` to find Saves that look like one.
- `read_save` returns one Save's caption, text in images, transcript, note, and metadata.
- `grep_library` matches text inside captions, text in images, transcripts, notes, and titles.
- `open_save` focuses a Save in the Pond window. `apply_filter` sets the library grid's filter.
- `start_conversion` writes converted copies to a folder you choose and returns a job id for `conversion_status` and `cancel_conversion`. `compress_images` replaces originals and records Undo.

A tool whose switch is off answers with an error that names the switch.

Each MCP client starts its own server process. It quits when the client closes its stdin or exits, so restarting a host doesn't leave servers behind.

## Publishing the client

The client is published to npm as [`pond-api`](https://www.npmjs.com/package/pond-api). It bundles the schemas from `@pond/schema` and depends only on `zod`.

To release a version, bump `version` in `packages/api/package.json`, merge it, and push a matching tag:

```sh
git tag pond-api@0.2.0 && git push origin pond-api@0.2.0
```

The `Publish pond-api` workflow tests the package, installs the packed tarball in an empty project, and publishes it with provenance through npm trusted publishing. Run `pnpm --filter pond-api pack:check` to try the tarball locally.

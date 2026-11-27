# Plan 008: Canvases as Share Pages

> Executor: this is Phase 4 of [plan 006](006-share-links.md). It was split out because extracting the board renderer passed plan 006's stop condition. Read this whole plan before you change a file under `features/canvas`, and honor each STOP.
>
> Drift check: `git diff --stat cc3974ffb..HEAD -- apps/desktop/src/renderer/src/features/canvas apps/desktop/src/shared/canvas-contracts.ts packages/share-page packages/schema/src/share-page.ts`.

## Status

- Priority: P3
- Effort: L
- Risk: MED. It moves code the desktop Canvas runs on.
- Category: refactor, then feature
- Planned at: `a79504d9d`, 2026-11-27
- Status: PROPOSED

| Phase | Scope                                                     | Status |
| ----- | --------------------------------------------------------- | ------ |
| 0     | Split view from edit inside `features/canvas`, no move    | TODO   |
| 1     | Move the read-only board into `packages/canvas-board`     | TODO   |
| 2     | Manifest `kind: "canvas"` and the Share Page viewer       | TODO   |
| 3     | Export Share Page and Create Share Link for a Canvas      | TODO   |

## Why it was split out

Measured at `a79504d9d`:

- Each item component (`save-item`, `note-item`, `text-item`, `figure-item`, `section-item`, `table-item`, `code-item`, `topic-item`, `drawing-item`, plus `connector-edge`) is an `@xyflow/react` node. Ten of them read edit state from `components/board/context`, seven render `../handles`, and six use `../editable-text`.
- They depend on `lib/document`, `lib/transform`, `lib/colors`, `lib/text-style`, `lib/stroke`, `lib/rich-text`, `lib/outlines`, and `lib/highlight`, and on 11 CSS modules.
- `save-item` reads `@/features/saves` and its pool, which can't leave the desktop app.

A read-only renderer therefore touches about 35 files and changes how every Canvas item is built. Plan 006 stops at about 25 files or any change to how the desktop Canvas behaves.

## Approach

Keep one implementation of how items look, so a shared Canvas never drifts from the one in Pond.

1. **View and edit split, in place (Phase 0).** Each item gets a pure `View` component: props in, markup out, no board context, no handles, and no `editable-text`. The existing node component becomes `View` plus the edit layers. Nothing moves, and the desktop Canvas must look and behave the same. Existing Canvas tests and browser tests are the guard. Add a screenshot test per item kind that compares `View` with the node in read-only state.
2. **Move (Phase 1).** `View` components, the pure `lib` modules they need, and their CSS move to `packages/canvas-board`. `features/canvas` imports them from there. `save-item`'s view takes a plain `{ src, width, height, title }`, and the desktop maps a Save to that. Move files in their own commit, separate from the semantic changes, as CONTRIBUTING asks.
3. **Viewer (Phase 2).**
   - The manifest gains `kind: "canvas"` and an optional `board` field. `board` holds items and connectors in the `CanvasItemSchema` shapes, with each `saveId` replaced by the page-local Save id. The field is optional, so version 1 readers keep working. Its shape is frozen in the compatibility fixture.
   - The viewer renders the board with pan and zoom (`@xyflow/react` in read-only mode, or a plain transform if that comes in smaller). Opening a Save on the board shows the same Save dialog as a Folder.
   - Drawings keep their `perfect-freehand` strokes.
   - Code blocks: check what `lib/highlight` pulls in. STOP if it adds more than 60 KB gzipped to the viewer. Ship code blocks unhighlighted instead.
4. **Export and links (Phase 3).**
   - Saves in Trash leave a "Not shared" placeholder at their position. The plan builder already refuses Trash.
   - Crops apply in the staged image, not with CSS, so the cropped-out pixels never reach the page.
   - Export Share Page and Create Share Link go in the Canvas menu. Share Links already handle any target. The link's target becomes `{ canvasId }`, which needs a `ShareLinkSchema` change with a reader for older records.

## Budgets and STOP conditions

- The viewer stays under 150 KB gzipped, JS and CSS together. It's about 102 KB today, and `@xyflow/react` is roughly 45 KB gzipped. STOP and ask if the board pushes it over budget, and consider loading the board code only when `kind` is `"canvas"`, as a second classic script.
- STOP if Phase 0 changes any pixel of an existing Canvas screenshot baseline.
- STOP if `packages/canvas-board` would need anything from `apps/desktop` other than `shared/canvas-contracts.ts`. Move that contract to `@pond/schema` first, as its own change.

## Verification

- Phase 0: existing Canvas tests, plus new `View` screenshot tests in light and dark.
- Phase 1: `pnpm architecture:check`, knip, and the same screenshots unchanged.
- Phase 2: viewer tests for each item kind from a fixture board, run in a browser test (pan, zoom, keyboard focus on Saves), plus `file://` loading as for Folders.
- Phase 3: plan tests showing a Canvas manifest holds no Library ids and applies crops, and the publish tests extended with a Canvas target.

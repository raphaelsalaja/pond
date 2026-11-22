# Plan 005: Render post thumbnails without a browser

> Executor: work phase by phase and honor each STOP condition. The engine lives in a fork of [rauchg/xeet](https://github.com/rauchg/xeet); Pond owns the per-source layouts and the loader.
>
> Drift check: `git diff --stat e6c63000e..HEAD -- apps/desktop/src/main/core/render-card apps/desktop/src/main/core/pipeline/workers/capture-tweet.ts apps/desktop/src/main/core/pipeline/workers/render-text-cover.ts apps/desktop/src/shared/tweet-card.ts`.

## Status

- Priority: P2
- Effort: L
- Risk: MED
- Category: feature
- Planned at: `e6c63000e`, 2026-11-16
- Status: IN PROGRESS

| Phase | Scope                                             | Status                                                        |
| ----- | ------------------------------------------------- | ------------------------------------------------------------- |
| 0     | Fork checkout, font stacks, host fonts            | DONE                                                          |
| 1     | X thumbnails through xeet, React card as fallback | DONE, needs in-app review before the version bump             |
| 2     | Bluesky layout and comparison harness             | DONE, Bluesky saves get the post card through `capture_tweet` |
| 3     | Threads layout, checked against the React card    | DONE, wired into the Threads card path                        |
| 4     | Reddit layout, avatar harvest                     | TODO                                                          |
| 5     | Tumblr, Mastodon                                  | DEFERRED                                                      |

## Why this matters

X and Threads thumbnails are drawn by loading a React card into a hidden offscreen `BrowserWindow` and taking a CDP screenshot (`apps/desktop/src/main/core/render-card/index.ts`). Each render pays for a window, a page load, a paint wait and a `sharp` pass. Bluesky, Reddit and Tumblr text posts get no post-shaped image at all: `render-text-cover.ts` draws a square of body text with no author, avatar or time.

xeet paints an X post to PNG in a few milliseconds from plain data, with no browser, and checks its layout against Chrome. Its paint and text stack is not X-specific, so the same engine can draw other sources.

## What xeet gives us

Measured on the cloned source (`crates/xeet-core`, ~22.9k lines of `src`):

- Reusable as is, about 30%: `display.rs` (display list), `paint/` (rasterizer, glyphs, emoji, images, PNG), `shape.rs` (HarfBuzz via `harfrust`), `inline.rs` (bidi, wrapping, clamping), `linebreak.rs`, `script.rs`, `color.rs`.
- Machinery reusable, policy not: `fonts.rs`. One process-wide face table is compiled from `assets/vendor/fonts/manifest.json`, and selection always tries Chirp first.
- X-only, about 65%: `frame/`, `cards/`, `rules/`, `tokens.rs`, `model.rs`, `paint/icons.rs`, X caps in `limits.rs`.
- `xeet-text` is a twitter-text port (entities, weighted length), not a text engine. Other sources skip it.
- `xeet-resolve` fetches from X. Pond already has the post data in `rawJson.capture`, so it isn't used.

All modules are `pub`, so a layout crate can depend on `xeet-core` and use `inline::layout`, `display::DisplayList` and `paint::rasterize_png` directly.

## Licensing

- xeet source: Apache-2.0. Keep `LICENSE` and attribution in the fork and in Pond's SPDX inventory.
- xeet's vendored fonts are not covered by Apache-2.0. Its README says to ship only fonts you're licensed for or fonts the host supplies.
  - Chirp: Pond already bundles Chirp `.woff` for `tweet/card`. Reusing it doesn't add new exposure, and doesn't resolve the existing one.
  - Arial, Apple Color Emoji, Hiragino, SF Pro: load from `/System/Library/Fonts` at runtime on macOS. Never bundle them.
  - Inter (Bluesky) and Reddit Sans (Reddit): SIL Open Font License. Bundling is fine.
- Linux and Windows builds keep the React renderer until each source has a licensed font set there.

## Architecture

```text
~/Developer/xeet                (fork of rauchg/xeet, branch `pond`)
  crates/xeet-core              engine; font stacks added here, kept upstreamable
packages/render                 (@pond/render)
  Cargo.toml                    workspace: pond-render (wasm-bindgen), bluesky, threads, reddit
  crates/bluesky|threads|reddit layout crates: Capture JSON -> DisplayList
  crates/pond-render            wasm entry: render(source, capture, options) -> PNG
  src/index.ts                  loads the wasm once, registers host fonts, exposes renderPost
  scripts/build.mjs             cargo + wasm-bindgen into dist/
```

- WebAssembly, not a `.node` addon: one artifact for every arch, no Electron ABI rebuild, and renders are milliseconds anyway.
- The engine change that matters is a font stack per render. `BlockStyle` gains a stack id, and `FontDb` selects within that stack, then shared fallbacks (emoji, CJK, symbols). X keeps its current stack as the default so upstream tests keep passing.
- Until the fork is pushed, `packages/render` depends on it by `path`. Switch to a pinned `git` + `rev` dependency before merging.

## Phase 0: engine

1. Clone the fork to `~/Developer/xeet`, branch `pond`.
2. Font stacks: add `stack` to manifest entries and `FaceData`, a `Stack` id on `BlockStyle`, and stack-aware `select_with`. Rename `FaceKind::Chirp` to `Primary`.
3. Host fonts: allow `register_font` for manifest entries marked `host`, with a collection index for `.ttc` files.
4. Variable fonts: set `wght` on the shaper instance and the outline location. Needed for SF Pro (Threads) and optional for Inter.

STOP if upstream `cargo test -p xeet-core` fails after step 2. The X stack must render byte-identical PNGs before and after.

## Phase 1: X

- In `capture-tweet.ts`, `tryNativeRender` calls `renderPost("twitter", ...)` first on macOS and falls back to `renderTweetCardPng` on any error or warning.
- Map `Capture` to xeet's `Post` in `packages/render/src/x.ts`. Keep link URLs in `text` so link cards render. Inline media and avatar bytes from the Save's local files.
- Bump `CAPTURE_TWEET_VERSION` only after a side-by-side review of real Saves.

## Phase 2: Bluesky

- Layout reference: [bluesky-social/social-app](https://github.com/bluesky-social/social-app) (MIT), so tokens come from source, not scraped CSS.
- Harvest gap: quoted posts are flattened into media. Add `quoted` to the Bluesky `Capture` in `harvest/bluesky/normalize.ts`.
- `planOps` gains `capture_tweet` for `bluesky`; `render-text-cover` stops running for it.

## Phase 3: Threads

- Reference: the existing `captures/components/threads/card` plus Pond's live-site Threads screenshots.
- Font: SF Pro from the host (Phase 0 step 4).

## Phase 4: Reddit

- Font: Reddit Sans (OFL). Harvest gap: no author avatar.

## Verification

- Per source, a harness renders fixture Captures with both the old path and the new one and writes a side-by-side sheet. Pixel diffs are informational until a source is signed off.
- Fixtures come from synthetic Captures. Real Saves are checked locally and never committed.
- Checks run once before push: `cargo test` in the fork and `packages/render`, then the desktop checks from `CONTRIBUTING.md`.

## Risks

- Platform redesigns break parity silently. Each layout records the reference revision it matches.
- The fork drifts from upstream. Keep engine changes small and offer the font-stack change upstream.
- macOS font files move between OS versions. Missing host fonts mean falling back to the React renderer, never drawing tofu.

# Plan 009: Native architecture assessment (Rust/GPUI)

> Exploration for [raphaelsalaja/pond#363](https://github.com/raphaelsalaja/pond/issues/363). This is an assessment and a proposed spike, not a rewrite plan. Nothing here changes production code.
>
> Drift check: `git diff --stat cc3974ffb..HEAD -- apps/desktop/scripts/memory-budgets.json apps/desktop/PERFORMANCE.md apps/desktop/src/main/core/pipeline apps/desktop/src/main/core/refresh/harvest-window apps/desktop/src/renderer/src/features/enrichment packages/render`.

## Status

- Priority: P2
- Effort: S for the spike; XL for any migration it might justify
- Risk: LOW for the spike, HIGH for a native UI rewrite
- Category: exploration
- Planned at: `cc3974ffb`, 2026-11-27
- Status: PROPOSED, waiting for review

| Phase | Scope                                                         | Status   |
| ----- | ------------------------------------------------------------- | -------- |
| 0     | Measure what users actually see (traces, footprint breakdown) | PROPOSED |
| 1     | Spike A: Rust core behind the existing UI (napi-rs)           | PROPOSED |
| 2     | Spike B: GPUI grid prototype against the same Library         | PROPOSED |
| 3     | Decide with numbers                                           | PROPOSED |

## Summary

Electron isn't what makes Pond slow day to day. Most of what was slow or heavy has been Pond's own work in the wrong place: synchronous SQLite on the main thread, inference in WebAssembly inside a renderer worker, full Chromium windows for harvest and card rendering, and caches nobody released. The fixes in #407 to #416, #672 and #729 follow that pattern, and each was fixed inside Electron. With the window closed, macOS still holds 536 MB, and 396 MB of that is the main process, which no UI toolkit change touches.

A full GPUI rewrite would remove the renderer and GPU processes, which are 40 to 55% of idle memory in CI on macOS and Windows, minus whatever the native UI itself costs. But it means re-creating about 145k lines of React renderer, a Lexical editor, an xyflow Canvas, PDF/EPUB/Mermaid/Shiki viewers and video playback. The toolkit is pre-1.0, has had screen reader plumbing only since May 2026, has no tray or video support outside macOS, and Pond would still need Chromium for harvest. That's a multi-quarter rewrite with a long tail of regressions, for a saving nobody has measured against a native UI's own cost.

Recommendation: move Pond's heavy core into Rust behind the current UI first (Library index, queries, thumbnails, fingerprints, inference), keep Electron for UI and harvest, and run one small, time-boxed GPUI grid spike against that same Rust core so a later UI decision rests on measurements of both sides. If the native grid doesn't beat the Electron grid on the agreed numbers on all three platforms, stop at the hybrid.

## Where Pond is slow today

Sources: the code at `cc3974ffb`, [PERFORMANCE.md](../apps/desktop/PERFORMANCE.md), the memory baselines recorded in #431 (`git show 0738e771d`), and the microbenchmark baseline in git history (`git log -p -- plans/performance-baseline.md`).

### Memory

CI medians, working set in MB, Electron 44.4.0, synthetic Library ([#431](https://github.com/raphaelsalaja/pond/pull/431)):

| OS                    | Scenario           | Main | Renderer | GPU | Utility | Total |
| --------------------- | ------------------ | ---: | -------: | --: | ------: | ----: |
| macOS arm64           | Idle, window open  |  395 |      194 |  92 |      47 |   736 |
| macOS arm64           | Window closed      |  396 |        0 |  94 |      47 |   536 |
| Windows x64           | Idle, window open  |  163 |      189 |  72 |      50 |   476 |
| Ubuntu x64 (xvfb)     | Idle, window open  |  297 |      334 | 182 |      93 |   906 |

Reading this:

- **Main is the biggest single process on macOS, and it doesn't shrink when the window closes.** 395 MB with no window is Node, V8 heaps for the AI SDK and 17 provider packages, MCP, Hono, drizzle, sharp/libvips, sqlite-vec, FFmpeg bindings and the text embedding model when loaded. A Rust core attacks exactly this process; a native UI alone does not.
- **Renderer + GPU is 190 to 290 MB at idle** (more on Linux under software GL). This is the share a native UI could cut, and it grows with decoded images (the 512 MB tile cap in #672 shows how high it can go).
- **Working set counts shared framework pages.** On macOS `smoke:memory` also reports `footprint`, which is what Activity Monitor shows. Users in #363 report 1 to 4 GB; those Libraries have enrichments on, real media and long sessions, which CI doesn't model. Inference models (Florence, EmbeddingGemma, Whisper, CLIP) loaded in the renderer's inference worker are the most likely gap between 0.7 GB in CI and 2 to 4 GB in the field. That's unmeasured, and Phase 0 measures it.

### CPU and responsiveness, path by path

| Path | Where it runs today | What's slow or heavy | Would Rust help? | Would GPUI help? |
| --- | --- | --- | --- | --- |
| Library queries, counts, FTS | `better-sqlite3`, synchronous, **on the Electron main thread** (`main/database/client.ts`) | Every query blocks main, which also serves IPC, the `pond://` protocol, harvest coordination and menus. #729 found sidebar counts averaging 147 ms in real logs and IPC requests queueing behind each other. `[pond perf] main thread blocked` exists for this reason. | **Yes, most.** A Rust core with a connection pool on its own threads (rusqlite) removes main-thread blocking structurally. Same SQLite, same schema. | No. GPUI doesn't fix a blocked data layer. |
| Vector search | `sqlite-vec` exact scan; embeddings stored as JSON `TEXT` in wide `saves` rows | Plan 004 rejected ANN and kept exact scan. Text-encoded vectors widen rows (the overflow-page cost #729 worked around with narrow indexes) and cost parse time. | Yes: store vectors as `f32` BLOBs, scan with SIMD; possible in TS too, cheaper in Rust. | No. |
| Bulk edits in the renderer pool | Renderer store, optimistic | 50k Saves × 1k selected: rating 330 ms p50, rollback 654 ms p50 (baseline 2026-10-30). Plan 002 targeted halving these. | Partly: if the core owns the canonical rows and the renderer only holds visible pages, the renderer pool shrinks. | Somewhat; GPUI state is cheaper than a JS store, but the algorithmic cost is the same. |
| Grid rendering | React + `@tanstack/react-virtual`, five layouts (grid, packed, justified, waterfall, list), CSS transforms, Chromium tiles | Fixed in pieces: generated card thumbnails instead of originals (#420), 2D translate (#483), stable slots (#729), shared context menu (#475), released decoded images (#672). No captured scroll trace exists yet (PERFORMANCE.md: "not measured"). | No. | **Yes, this is where GPUI is strongest:** GPU-instanced quads, no DOM/layout/style recalc, images uploaded as textures directly. The win is real but unquantified until Phase 2. |
| Thumbnails | `sharp`/libvips in main via the `pond://` protocol handler, on demand; GIF and video posters through FFmpeg | libvips is already native and fast; cost is the main-thread hop and Node buffer copies. Text post cards used an offscreen `BrowserWindow` + CDP screenshot; plan 005 is replacing that with a Rust renderer. | Small to moderate: `image`/`fast_image_resize` or libvips via Rust avoids the main-thread hop. | Indirect: GPUI can decode and show images without a protocol round-trip. |
| Ingest pipeline | Queue worker in a `utilityProcess`, FFmpeg/ffprobe child processes, `yt-dlp` | Already off the main thread. The work is network and FFmpeg bound. | Little. | No. |
| Harvest and Sync | Pool of up to 3 hidden `BrowserWindow`s on per-Account session partitions (`refresh/harvest-window/pool.ts`), 28 Source adapters | Each window is a full renderer running a heavy SPA (X, Instagram…). 60 s idle eviction already exists. | No. | **No. A native app still needs a browser engine here.** See below. |
| On-device inference | `@huggingface/transformers` + `onnxruntime-web` in a renderer Web Worker: WebGPU when an adapter exists, otherwise WASM | WASM runs single-threaded unless the page is cross-origin isolated, and capped at half the cores when it is. Models live in renderer memory. Main loads a second text embedding model for queries. | **Yes, large.** Native ONNX Runtime (`ort` crate) gets CoreML / DirectML / CUDA execution providers and real threads; one model instance shared by indexing and queries. | No, except that it moves inference out of the renderer. |
| Duplicates (dHash, video frames, audio prints) | Main + workers, sharp and FFmpeg | Batches of 25, paused during ingest. CPU bound but already paced. | Yes, moderate: hashing and the multi-index are ideal Rust code. | No. |
| Startup | Electron + Node module graph + DB open + migrations | `[pond startup]` milestones exist; first usable Library is not measured. | Some: a Rust core opens the DB faster and loads no JS for it. | Yes: native cold start is typically well under Electron's, but unmeasured for Pond. |

### Frame drops with small Libraries

One report in #363 describes frame drops and system lag with under 100 Saves on an Intel Mac. That isn't a data-size problem; with that few rows the data layer is idle. Likely suspects are compositing work (animated fish, `motion` springs, blur and backdrop effects, video hover) on an integrated Intel GPU, or a background enrichment run loading a model through WASM on the CPU. A DevTools trace on that hardware would tell which. A native UI would also help here, but so might a reduced-effects path, and the trace costs an hour.

## What a native architecture would change

### Option A: full native UI in GPUI

What goes away: the renderer process, the GPU process, Chromium's compositor, React reconciliation, and the IPC hop for every query. That's 190 to 290 MB at idle by the CI baselines above, more with decoded images. How much a GPUI grid itself costs is unknown: there are no neutral numbers for GPUI apps, and Phase 2 is there to measure it.

What doesn't go away:

1. **Harvest needs Chromium.** Pond's Sources work by loading the real site in the user's signed-in session and reading it. GPUI has no web engine. Options: keep a headless Electron or CEF helper process just for harvest (that brings back 150 to 300 MB while syncing, and a second runtime to ship), or use the OS webview through `wry` (WKWebView, WebView2, WebKitGTK), which changes cookie stores, user agents and site behavior per platform and would mean revalidating all 28 adapters. Session import from the extension writes cookies into Electron partitions today; that whole path would be redone.
2. **Web-only features need replacements or a webview.** Lexical (notes and rich text), xyflow (Canvas), PDF.js, epub.js, Mermaid, Shiki, Streamdown (Agent chat Markdown), three.js, the `<video>` player with posters and hover play. Each is either a rewrite in GPUI or an embedded webview, and embedded webviews bring back the memory being saved.
3. **The AI SDK, MCP server and provider clients are TypeScript.** The Agent would need a Rust reimplementation or a Node sidecar. Rust equivalents exist for some providers but nothing at the AI SDK's breadth.
4. **Accessibility.** Pond's UI is built on UI SDK with keyboard, focus and ARIA tests. GPUI got AccessKit in May 2026, but only elements annotated with an ID and a role are exposed, and live regions are still an open PR. A GPUI Pond starts at zero and has to rebuild what UI SDK gives today.
5. **Platform services GPUI lacks.** There's no tray icon and no global shortcuts, and Pond uses both. Video and webviews only have a native path on macOS.

Size of the job: ~143k lines of renderer TypeScript, ~118k lines of main, ~240 IPC operations and 7 preload surfaces, plus the UI package's components and their docs. Even a team fluent in GPUI would need many months to reach parity, with feature work frozen or done twice. And GPUI's API breaks often while it's released only as Zed snapshots.

### Option B: Rust core behind the existing UI (hybrid)

Move the Library's index and the CPU-heavy, stateless pieces into a Rust library loaded into main as a native module (napi-rs), or into one long-lived Rust helper process:

- Library index: SQLite access on a thread pool (rusqlite), the query planner for filters and Ask plans, counts, FTS, vector scan over binary `f32` vectors. The renderer keeps calling the same IPC operations; their handlers become thin.
- Media: thumbnails, posters, dHash/video/audio fingerprints, blurhash.
- Inference: ONNX Runtime with platform execution providers, one shared model per kind, out of the renderer.
- Post rendering: already Rust (`packages/render`, xeet fork, today built to WASM); it can link natively instead.

What it buys: main thread never blocks on a query; the renderer drops its inference worker and the heaviest models; main's JS heap shrinks as query and media code leave it. It keeps every UI feature, the extension, harvest and the Agent unchanged. It's incremental: one IPC operation at a time, behind the existing contracts, with the existing tests as the oracle. And it builds exactly the core a native UI would later need, so it isn't a dead end if Option A is chosen afterwards.

What it doesn't buy: the renderer and GPU processes stay. Expect total idle memory to fall modestly (main shrinks, renderer loses inference) rather than halve.

Cost: one more native module for every shipped target (macOS arm64 and x64, Windows x64, Linux on the host arch). Pond already ships native code per platform: `better-sqlite3`, sharp, sqlite-vec, a Safari `.node` addon and the C Native host, so the release pipeline knows how. Add a Rust toolchain in CI and the schema contract in two languages. Keep `@pond/schema` as the source of truth and generate Rust types from it, or define row shapes once in Rust and export TS types, but don't hand-maintain both.

### Option C: Tauri or another webview shell

Keeps the React UI, swaps Chromium for the OS webview and Node for Rust. It saves the bundled Chromium and some memory, but WebKitGTK on Linux and WKWebView behave differently from Chromium (WebGPU, codecs, CSS), and harvest still needs a real browser engine per Account. It has Option A's backend rewrite cost without its rendering win. Not recommended.

## Rust core inventory

What can move to Rust behind the current UI, found by reading `apps/desktop/src` at `cc3974ffb`. A module is a good candidate when it is CPU-bound or blocks the main thread, takes and returns narrow typed data, and already has tests or fixtures that can check a port against the TypeScript output. Line counts exclude tests.

### How the core plugs in

- **One napi-rs addon**, say `packages/core`, with the same Cargo conventions as `packages/render`. Main loads it, and the queue worker's `utilityProcess` can too. Every exported call is async and runs on Rust's own thread pool, so main never waits on it.
- **N-API is ABI-stable**, so an Electron upgrade doesn't force a rebuild. Today `better-sqlite3` is rebuilt for each Electron version in `postinstall`.
- **The core opens the Library database itself**, as read-only connections in WAL mode, next to the existing `better-sqlite3` writer. It loads `sqlite-vec` too. Writes, the executor journal and Undo stay in TypeScript until there's a reason to move them.
- **Hand IDs and small results across the boundary, not rows.** Turning 50k Saves into JS objects costs about as much as the work being moved. Wherever the core needs Library data, it reads it straight from SQLite.

### Move first

| # | What | Where now | Why it's slow | Rust shape | Size | Effort |
| - | ---- | --------- | ------------- | ---------- | ---: | ------ |
| 1 | **Duplicate scan**: `matchLibrary`, `buildPairs`, `groupPairs`, the hamming multi-index and the Library load | `main/core/duplicates`, `main/lib/fingerprint/hamming-index.ts`. It runs synchronously on the main thread from the `saves-mutation` IPC handler (`ipc/queries/saves-mutation.ts:357`). | It loads every Save, JSON-parses every CLIP embedding (768 numbers stored as text) and validates each one with zod, then matches the whole Library in one synchronous call. The 20k-Save scale test sets a 60 s hook budget because a cold run overruns the default. | A pure function over rows the core reads itself. Fingerprints become `u64` bit sets. Run it on a background thread and return pairs and groups. | 2.1k | M |
| 2 | **Fingerprint compute**: audio print (FFT over 120 s at 5512 Hz, 2048-point frames, hop 128), image dHash, video dHash sequences | `main/lib/fingerprint` (`fft.ts`, `audio-print.ts`, `dhash.ts`, `video-print.ts`), driven by `fingerprint-worker.ts` **in main**, one file at a time between 250 ms gaps | The FFT and bit packing are hand-written TypeScript running on main's event loop. About 5,000 FFT frames per audio file stall the thread that serves IPC and `pond://`. | `rustfft` and SIMD popcount. Keep FFmpeg as the decoder, reading PCM and gray frames from its pipe as today. Pausing for thermal state, battery and ingest stays in TypeScript and just calls the core. | 0.6k | S |
| 3 | **Library read path**: page queries, sidebar counts, Account counts, FTS, filter execution, Split Post grouping | `main/core/library-query.ts`, `keyword-query.ts`, `active-library-query.ts`, `library-retrieval.ts`, and the hot handlers under `main/ipc/queries` (8.6k lines in all, most of it not hot) | `better-sqlite3` is synchronous on main (`main/database/client.ts`). #729 found sidebar counts averaging 147 ms in real logs, with IPC requests queueing behind each other. Narrow indexes fixed the worst queries, but any slow plan still freezes main. | A rusqlite read pool. Port the query builder for filters and Ask plans and keep the SQL identical. Move handlers one at a time, starting with what `[pond perf] slow query` logs most. | 1.1k core + per-handler | M, then incremental |
| 4 | **On-device inference**: CLIP and EmbeddingGemma embeddings, Florence captions, Whisper, sensitive-content classification | Renderer Web Worker, `@huggingface/transformers` + `onnxruntime-web` (WebGPU or WASM, `renderer/src/features/enrichment/lib`), and a second text model in main (`main/core/query-embeddings.ts`, transformers.js on Node) | WASM runs single-threaded unless the page is cross-origin isolated, the models live in renderer memory, and main holds its own copy of the text weights. This is the most likely cause of the 2 to 4 GB field reports (Phase 0 confirms or rules it out). | `ort` with CoreML, DirectML or CPU execution providers, and the `tokenizers` crate. One instance per model serves indexing and search. Florence and Whisper need their decoding loops ported, which transformers.js does today. A cheaper step that needs no Rust: run transformers.js on `onnxruntime-node` in a `utilityProcess` and share it with search. Check which native execution providers each platform's `onnxruntime-node` build ships before choosing. | 3.2k + 0.2k | L |
| 5 | **Startup reconcile**: walk `items/`, stat each `info.json`, compare its mtime to `library_scan`, re-read what changed | `main/core/scan.ts`, `main/lib/library.ts` (`scanLibrary`) | One `stat`, one `SELECT` and one mutation scope per Save, strictly in sequence. That's 50k awaited round trips on every launch of a 50k-Save Library, even when nothing changed. | Parallel directory walk, one bulk read of `library_scan` into a map, and only changed IDs go back to TypeScript to upsert. | 0.7k | S |

Items 1, 2 and 5 are self-contained and have fixtures, so the TypeScript output is an exact oracle. Item 3 has the largest daily effect. Item 4 has the largest memory effect and the most porting work.

### Move once the core exists

| What | Where now | Gain | Note |
| ---- | --------- | ---- | ---- |
| Card thumbnails, previews, GIF and video posters, blurhash, image dHash | `pond://` handler in `main/protocol.ts`, `main/core/thumbnail.ts`, `save-thumbnail*.ts`, `gif-thumbnail.ts`, `main/lib/blurhash.ts`, `phash.ts` (1.0k) | Thumbnail requests stop going through main. libvips is already native, so the gain is fewer main-thread hops and buffer copies, not faster resizing. | Check format coverage first: sharp handles HEIC, AVIF, animated GIF and WebP, SVG and more. Binding libvips from Rust keeps that coverage, while the pure-Rust `image` crate doesn't. |
| Post renderer | `packages/render`: already Rust, built to WASM, loaded with `WebAssembly.compile` | Native speed and no WASM heap. | Build the same crates into the core as a native target. Coordinate with plan 005, which is in progress. |
| Storage, integrity and health walks | `main/core/storage-stats.ts`, `library-integrity.ts`, `library-health`, `duplicates/asset-index.ts` (SHA-256 per Asset) | A parallel walk, hashing with no Node stream overhead. | Hashing already uses native `crypto`, so the gain is modest. |
| Vector storage and scan | Embeddings as JSON `TEXT` in `saves` rows, `parseJsonVector` in `vec-index.ts`, `sqlite-vec` exact scan | Binary `f32` vectors make rows narrower and remove parse time everywhere vectors are read. | **This change doesn't need Rust.** A `Float32Array` BLOB migration in TypeScript gets most of the gain. It's a Library format change, so it needs compatibility fixtures. |
| File watching | `main/core/storage-watcher.ts` | `notify` gives one consistent behavior across all three OSes. | Low priority unless watching misbehaves. |

### Leave in TypeScript

| What | Why |
| ---- | --- |
| Harvest, Sync, Watches and the 28 Source adapters (`main/core/refresh`, 28k lines) | They run inside Chromium sessions and are network-bound. A port gains nothing and would mean revalidating every Source. |
| Ingest pipeline orchestration: queue, rate governor, retries, admission (`main/core/pipeline`, 13.5k) | It's I/O and policy work, already off main in a `utilityProcess`, and heavily tested. Its CPU-heavy pieces (FFmpeg, thumbnails) are covered above. |
| Agent, MCP server and AI SDK providers (`main/core/agent`, 9.2k) | The ecosystem is TypeScript. Moving it would mean rewriting the provider clients. |
| Executor, journal, Undo, folder, tag and Saved View writes | Correctness matters more than speed here, and none of it is hot. Keep one writer. |
| Semantic clusters and recommendations | Capped at 2,000 candidates and 24 neighbors (`semantic-clusters.ts`), so the work is bounded and small. |
| Zip export and import, WARC recording | Already streaming (`yazl`, `yauzl`, `warcio`) and I/O-bound. |
| Renderer grid layouts, Save pool, Ask parsing (`chrono-node`) | These belong to the UI. They're a Rust question only if a native UI is chosen. |

### Fix in TypeScript first, regardless

Some of these costs come from the algorithm, not the language. Two are cheap enough to fix before any Rust exists, and they make the before-and-after numbers honest:

- **Reconcile (item 5):** read `library_scan` once into a map and stat in parallel with a concurrency limit.
- **Duplicate and vector loads (item 1 and the vector row):** decode vectors with a single `Float32Array` path instead of zod's per-element validation.

If those two alone take the pain away, items 1 and 5 drop down this list.

## Cross-platform reach

State of GPUI as of 2026-11-27, from primary sources:

| Area | Status | Source |
| --- | --- | --- |
| Release and API | `gpui` on crates.io is 0.2.2 (2025-10-22), a year behind Zed's main. The README warns of frequent breaking changes, and gpui.rs says GPUI is "tied to Zed" for the near future. In practice apps pin a Zed commit or `gpui-pre`, a community snapshot published by Longbridge (0.3.14, 2026-11-23). | [crates.io/gpui](https://crates.io/crates/gpui), [gpui README](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md), [crates.io/gpui-pre](https://crates.io/crates/gpui-pre) |
| macOS | Metal. Reference apps: Zed 1.0 (2026-04-29) and Delta (2026-08-12). | [Zed 1.0](https://zed.dev/blog/zed-1-0), [Delta](https://zed.dev/blog/introducing-delta) |
| Windows | DirectX 11 with DirectWrite, stable since Zed for Windows shipped on 2025-10-15. | [Zed for Windows](https://zed.dev/blog/zed-for-windows-is-here) |
| Linux | wgpu replaced Blade around February 2026 (zed#46758); Wayland and X11 are both supported. wgpu fixes are still landing in November 2026. | [gpui README](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md) |
| Accessibility | AccessKit merged on 2026-05-27 ([zed#56065](https://github.com/zed-industries/zed/pull/56065)). Only elements given a stable ID and role are exposed, so every Pond control would need annotating, and live regions are still an open PR ([zed#67481](https://github.com/zed-industries/zed/pull/67481)). Zed's own Windows screen reader issue ([zed#41138](https://github.com/zed-industries/zed/issues/41138)) is still open. | as linked |
| Video | No player. On macOS, `surface()` shows a `CVPixelBuffer`, and since 2026-11-22 a native NSView can be composited into the scene ([zed#67311](https://github.com/zed-industries/zed/pull/67311)). On Windows and Linux the options are a GStreamer-based third-party crate with software upload (`gpui-video-player`, 0.1.x) or writing your own FFmpeg pipeline. | as linked, [lib.rs/gpui-video-player](https://lib.rs/crates/gpui-video-player) |
| Webview | `gpui-wry` is experimental and overlays a child native window instead of compositing it. The native-view compositing above is macOS only. | [docs.rs/gpui-wry](https://docs.rs/crate/gpui-wry) |
| Images | `img()` decodes common formats through the `image` crate and plays animated GIF and WebP. | `crates/gpui/src/elements/img.rs` |
| Lists and text | `uniform_list` and `list` virtualize rows. There's no grid virtualizer, so Pond's five layouts would be built on rows by hand. There's no rich-text editor: Zed's editor is a GPL-3.0 code editor. | `crates/gpui/src/elements` |
| Tray, global shortcuts | Neither exists. The tray PR ([zed#44047](https://github.com/zed-industries/zed/pull/44047)) was closed unmerged. Pond needs both: Keep Running When Closed, the File To ring and Quick Capture. | as linked |
| Components | GPUI Kit (`gpui-component`, Longbridge, about 21k stars) has 60 to 75 components. It's at 0.11.0 (2026-11-23), with breaking minor releases weekly. `gpui-motion` is 0.1.0 with negligible use; GPUI has its own basic animation. | [gpui-component](https://github.com/longbridge/gpui-component) |
| Memory | No neutral numbers found. Zed claims about 600 MB for the editor against 3 to 4 GB for VS Code. That's the vendor's own figure, and an editor isn't a media grid. | [zed.dev/compare/vscode](https://zed.dev/compare/vscode) |

GPUI renders fast and looks the same on all three platforms, but not everything around the renderer is. macOS gets the most: Metal, native-view compositing and CoreVideo surfaces. Windows and Linux get the renderer and little media integration. A GPUI Pond would play video natively on macOS and through a self-built pipeline elsewhere, and would need its own tray and global-shortcut code on every platform. Pond's Linux build is the riskiest: Electron's software-GL baseline there is already the heaviest of the three (906 MB), and GPUI's Linux renderer changed backend this year.

Other Rust options, briefly: **Tauri 2** (2.12, Nov 2026) keeps the React UI on the system webview, which is Option C above. **Slint** (1.19, stable) has a dual commercial or GPL license and targets forms and embedded more than media grids. **Iced** (0.14) and **Dioxus** (0.7) are pre-1.0, and Dioxus's desktop target is still a webview. **egui** is immediate-mode, suited to tools. **Makepad** has had no widgets release since May 2025.

## Browser extension and Native host

The extension doesn't talk to Electron. It talks to `pond-native-host`, a 324-line C program (`apps/desktop/native-host/pond-native-host.c`) that relays Chrome native messaging frames to a per-user Unix socket or named pipe served by main (`src/main/native/server.ts`). The RPC surface is small: `capture.accept`, `capture.status`, `extension.settings`, `files.import`, `folders.list`, `tags.list`, `fish.list`, `library.info`, `session.import`, `session.pending`, `session.refresh`.

- **Hybrid (B):** nothing changes. Main still owns the socket; handlers call into the Rust core.
- **Native UI (A):** the native app must serve the same socket path and the same framed JSON contract. The host binary, its manifests and the extension stay as they are. The hard part is `session.import` / `session.refresh`: they put browser cookies into Electron session partitions for harvest. Without Electron those cookies go into whichever engine does harvest, which is a redesign, not a port.
- Safari's extension and the share extension use the App Group path (`native/app-group.ts`); same rule, the contract is the boundary.

## Migration cost and risks

| Risk | A: GPUI UI | B: Rust core |
| --- | --- | --- |
| Parity gap and frozen feature work | Very high | Low; one operation at a time |
| Toolkit stability (pre-1.0, Zed-driven API) | High | None |
| Accessibility regression | High: AccessKit exists, every element must opt in | None |
| Harvest breakage | High (new engine or sidecar) | None |
| Two languages for contributors | Yes | Yes, scoped to `crates/` |
| Native build matrix | Larger (GPU backends per OS) | Same as today plus one crate |
| Data safety | Same Library format; risk is in rewritten write paths | Same; executor journal and compatibility fixtures guard both |

The Library format is the safety net in both cases: plaintext files plus a rebuildable index, with compatibility fixtures under `apps/desktop/test/fixtures/compatibility`. Any Rust writer must pass those fixtures before it writes a user's Library.

## Recommendation

1. **Do Phase 0 first.** The field reports (1 to 4 GB, frame drops on Intel) are bigger than anything CI shows, and nobody has a trace of them. Measure before moving anything.
2. **Commit to Option B as the direction**, in the order of the [Rust core inventory](#rust-core-inventory): duplicates and fingerprints to prove the toolchain, then the Library read path, then inference. Those are the pieces that block main and inflate the renderer, and any future native UI would need them too.
3. **Run Spike B (GPUI grid) time-boxed alongside**, so the Option A question gets a measured answer instead of staying open in #363.
4. **Decide A only if** the spike beats the Electron grid by the margins in Phase 3 on macOS, Windows and Linux, and the accessibility and harvest answers are acceptable.

## Phase 0: measure what users see

Read-only, uses the existing tooling. Follow PERFORMANCE.md's rules: synthetic Libraries only, no runtime restarts without the owner's approval.

1. Extend `smoke:memory` with a scenario that turns enrichments on and processes the 50 seeded Saves, then idles. Record per-process footprint during and 60 s after. This answers how much of the field 2 to 4 GB is inference.
2. Seed 10k and 50k synthetic Saves with real thumbnails and record: first usable Library, a fixed scroll path (frames dropped, long tasks), filter-to-paint, and main-thread blocked counts. Run on Apple silicon, an Intel Mac, Windows and Linux.
3. Break main's 395 MB on macOS down with a heap snapshot plus `footprint`: what's V8 heap, what's native (sqlite page cache, libvips, models).

STOP if any measurement requires opening a personal Library or restarting the shared runtime without approval.

## Phase 1: Spike A, Rust core (3 to 4 days)

Goal: prove the toolchain on the safest module, then show that the core removes main-thread blocking without changing behavior.

1. Add `packages/core` (napi-rs) and build it for every shipped target in CI. Load it only behind a development flag.
2. Port the duplicate engine and fingerprints (inventory items 1 and 2). They're pure functions with a scale fixture, so the TypeScript output is the oracle. Compare pairs, groups and prints on `engine.scale.test.ts` and the fingerprint fixtures, then time a 20k-Save scan on both paths.
3. Port `saves.sidebarCounts` and the first and next Library page (item 3) on a rusqlite read pool against the same database file. `library-query.test.ts` and `sidebar-counts-benchmark.test.ts` must match exactly.
4. Measure the `[pond perf] main thread blocked` events during a 10k-Save ingest plus a duplicate scan, with the flag on and off.

STOP if results differ from the TypeScript path on any fixture, or if the module can't be built for every shipped target in CI.

## Phase 2: Spike B, GPUI grid (5 days, time-boxed)

Goal: an honest number for what a native grid costs and saves.

- A standalone GPUI binary (not shipped) that opens a synthetic Library read-only through `pond-core`, shows the uniform grid layout with generated thumbnails, virtualized, with hover and selection, and plays one video if the platform allows.
- Measure on macOS (Apple silicon and Intel), Windows and Linux (Wayland and X11): idle footprint, footprint after scrolling 10k and 50k Saves, frame times on the Phase 0 scroll path, cold start to first paint.
- Check with VoiceOver, Narrator and Orca whether the grid exposes anything.

STOP at the time box whether or not it's finished; an unfinished spike is a finding.

## Phase 3: decide

Choose a native UI only if all of these hold, otherwise continue with Option B alone:

- Grid footprint at 50k Saves is at least 40% below Electron's renderer + GPU on every OS.
- Scroll path has no dropped frames where Electron drops them, on the Intel Mac.
- A screen reader path exists or is credibly scheduled upstream.
- Harvest has a chosen engine whose memory cost is counted in the comparison.

Record the decision and its numbers here, then delete this plan as the README asks.

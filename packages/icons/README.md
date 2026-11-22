# @pond/icons

Pond's own icon set. Every glyph is drawn once on an 18×18 grid and scales to
any size. Import from the package root:

```tsx
import { IconFolder, IconStar } from "@pond/icons";

<IconFolder />
<IconFolder size={12} />
<IconStar size={24} />
```

<!-- counts -->
371 icons: 355 outline and 16 solid, plus 145 open states. 90 are folder picker objects. 18 registered parts.
<!-- /counts -->

There is one drawing per glyph, and nearly every glyph is a line drawing.
Only the disclosure caret, status toasts, and the X and Threads post controls
are solid.

Props:

- `size` sets width and height. Default `18`.
- `strokeWidth` applies to outline glyphs. It is the on-screen stroke in pixels.
  Default `1.25` at every size up to 18px, matched to Linear's line weight.
  Up to 18px the stroke is non-scaling, so it stays exact when CSS resizes the
  icon instead of `size`. Above 18px the stroke grows with the glyph.
- The glyph renders at `GLYPH_SCALE` (1) of the box, set in
  `create-icon.ts`. Change it there to resize every glyph at once. Stroke
  widths stay in on-screen pixels.
- `title` labels the icon for assistive tech. Without it the icon is
  `aria-hidden`.

## Drawing a glyph

The measured spec lives in [`icon-spec.md`](icon-spec.md) and the voice in
[`style.md`](style.md). Every glyph is a script in `src/`, drawn with the
helpers in `helpers.mjs` from the measurements in `style.json`.

1. Write `src/<kebab-name>.mjs`. It exports `default (h, s) => parts`, plus
   `open` when the glyph has an expanded state. A part is path data, which is
   stroked, or `{ d, solid: true }` for a solid dot or a solid glyph.
   - Lines are 1.25 with round caps and joins, on multiples of 0.125.
   - Ink stays 1.75 from the frame. Size each glyph to its keyline in
     `style.json`: square, circle, wide, tall, or glyph for arrows, chevrons,
     checks and plus.
   - Reuse the shared parts in `src/parts/`: the folder, the file, the ring,
     the dot, the slash, the plus and the badges. A badge sits bottom right
     and its host stops at the hole around it (`badge.mjs`).
   - Check every glyph at 18px and 12px.
2. Add it to `svg/manifest.json`: one concept nobody else answers, the words
   someone would search for, and any `base` and `parts`.
3. Run `pnpm --filter @pond/icons generate`. It draws every script into
   `svg/<kebab-name>/` (with `-open` beside it), redraws the registered
   `parts/`, checks the manifest against the drawings, then rebuilds
   `index.ts`, `concepts.md`, and the counts above. When a check fails it
   writes `REPORT.md` and stops. CI runs the check with `--check`.

Browse the set in `lab/index.html`, opened straight from disk in any
browser: search by tag, the concepts table, parts boards, and the stroke
test. `generate` writes the page's `lab/data.js`, so run it once first.

## Brand marks

Social and brand marks live under `social-media/custom/`. The X, GitHub, and
Google Chrome paths come from [Simple Icons](https://simpleicons.org/) (CC0).
Provider logos are documented in `social-media/custom/provider-logos.md`. The
marks remain their owners' trademarks.

The `tweet-*` and `threads-*` glyphs in `svg/` redraw the X and Threads
post controls on the 18×18 grid so capture cards match the original post. They
remain their owners' marks.

The Pond mark lives in `brand/`: `icon.svg` is the vector source, and `tints/`
holds Icon Composer colorways. The desktop app defaults to `tints/aqua` for the
Dock icon.

## License

The glyphs in `svg/` are original Pond artwork under the repository's MIT
license, except the `tweet-*` and `threads-*` redraws noted above.

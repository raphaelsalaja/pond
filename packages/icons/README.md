# @pond/icons

Pond's own icon set. Every glyph is drawn once on an 18×18 grid and scales to
any size. Import from the package root:

```tsx
import { IconFolder, IconStar } from "@pond/icons";

<IconFolder />
<IconFolder size={12} />
<IconStar size={24} />
```

There is one drawing per glyph, and nearly every glyph is an open stroke
drawing. Only media transport controls, the disclosure caret, and the X and
Threads post controls are solid. Props:

- `size` sets width and height. Default `18`.
- `strokeWidth` applies to stroke glyphs. It is the on-screen stroke in pixels at
  `size`. Default `1.7` at 18px. Below 18px the default thins by the square
  root of the scale, never under 1px: about 1.6 at 16px, 1.5 at 14px, and
  1.39 at 12px. An explicit `strokeWidth` is exact at any size up to 18px.
  Above 18px the stroke grows with the glyph. When CSS resizes the icon instead
  of `size`, the stroke scales with it, so a 14px button icon thins to match.
- `title` labels the icon for assistive tech. Without it the icon is
  `aria-hidden`.

## Drawing a glyph

1. Draw on an 18×18 artboard: 1.7 stroke, round caps and joins, live area
   1.75 to 16.25. Circles use r7.25. Badges sit at the bottom-right around
   (13.875, 13.875), and the base shape stops short of them by a 1.25 gap.
   - Round every corner. Boxes 12 or wider use r4, boxes 7 to 11 use r3,
     and parts under 5 use r1 to r1.5. Polygons such as stars, shields and
     triangles get arc or curve corners, never a bare point.
   - Prefer circles, arcs and curves to straight runs when the object allows.
   - Draw the object people already know: a bell with a clapper, a trash can
     with a lid handle, a plane with swept wings. Moving things (rocket,
     plane, paperclip) tilt 45° and a book leans like a cover in hand.
   - Keep 3.4 between stroke centers, both between details and from a detail
     to its frame. At 12px the stroke grows to about 2.1 units, and anything
     closer fills in. Make small marks at least 1.5 long or a stroked r0.25 dot.
   - Check every glyph at 12px. If it fills in, drop details before shrinking
     gaps: two lines instead of three, a solid dot instead of a small ring.
   - Variants (`folder-plus`, `trash-xmark`) reuse their base glyph's exact
     shape.
   - Draw one object. A plural uses the single glyph (`IconTag` for tags),
     never a stack with back outlines peeking out.
   - Draw every object as a 1.7 outline, masses included: bags, people,
     tools, clocks, and cameras. Keep the counter open, and leave a contour
     broken where a gap still reads as the object, like a slashed bookmark.
   - Solid ink is for small accents, like a dot, a lens or a keyhole, and for
     a half that carries the meaning, like `contrast` and `fill`.
   - A filled state belongs to the component, not the drawing. Set
     `fill: currentColor` on the svg, as the rating does for a set star.
   - Make a glyph solid only for media transport (play, pause, skip) and the
     disclosure caret.
2. Save it as `svg/<kebab-name>.svg`. Use only `<path>`, `<circle>`, and
   `<rect>`. A solid glyph sets `fill="currentColor"` on the root and is a
   flattened shape, not strokes. A stroke glyph has no root fill.
3. Run `pnpm --filter @pond/icons generate` to rebuild `index.ts`. CI runs the
   same script with `--check`.

The generator lists glyphs nothing imports, so unused drawings are easy to
spot.

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

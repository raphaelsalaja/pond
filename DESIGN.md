---
name: Pond
description: A local-first archive for everything you save across the open web.
colors:
  background: "#fcfcfc"
  surface-subtle: "#f9f9f9"
  surface: "#f1f1f1"
  surface-pressed: "#e9e9e9"
  border-subtle: "#e2e2e2"
  border: "#cdcdcd"
  text-low: "#646464"
  text-high: "#1b1b1b"
  text-muted: "#8d8d8d"
  accent: "#00a2c7"
  accent-text: "#00718f"
  accent-tint: "#f1fafd"
  danger: "#e54d2e"
  danger-surface: "#ffefec"
  danger-text: "#c63b1b"
typography:
  display:
    fontFamily: "inter-variable, ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "inter-variable, ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "inter-variable, ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.4
  body:
    fontFamily: "inter-variable, ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "inter-variable, ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.4
rounded:
  xs: "8px"
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-high}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    padding: "0 13px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-low}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    padding: "0 13px"
    height: "32px"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.text-low}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    padding: "0 13px"
    height: "32px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    padding: "0 13px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger-text}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    padding: "0 13px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.text-high}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  select-trigger:
    backgroundColor: "transparent"
    textColor: "{colors.text-high}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 13px"
    height: "36px"
  select-popup:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-low}"
    rounded: "{rounded.md}"
  field-label:
    textColor: "{colors.text-low}"
    typography: "{typography.label}"
---

# Design System: Pond

## 1. Overview

**Creative North Star: "The Quiet Library."**

Pond looks the way a well-kept private library feels: shelves, not a
storefront. The surface is calm enough that hundreds or thousands of
saves can live on it without becoming noise. Color is restrained —
tinted gray as the room, sky blue as the only voice, used sparingly.
Typography does the heavy lifting: a single optical-sized variable
sans-serif (Inter Variable) carries everything, with rhythm built from
weight and size contrast rather than divider lines or boxes. Edges are
softly rounded (8–14 px), shadows are layered hairlines (1 px ring +
1–4 px ambient drop), and motion is short and always eased: one
transition curve, one duration, no bounce.

The system explicitly rejects the visual reflexes of its category. No
SaaS dashboard chrome (no hero-metric blocks, no gradient accents, no
identical card grids). No social-feed engagement furniture. No
read-it-later utilitarianism. No bubbly consumer warmth. No
AI-generated tool-marketing aesthetic — sky blue is the accent, but it
is never the surface, and it never shows up as a gradient. The surface
of Pond looks like a Mac power-user tool tended slowly: Linear's
interface rigor, Are.na's cultural posture, the patience of a Bear
notebook.

**Key Characteristics:**

- Restrained color: one accent, ≤10% of any given screen.
- Light + dark both first-class via `light-dark()`. Theme is decided by
  the system, not the brand.
- Inter Variable, optical-sized at 14, with `tnum`, `ss01`, `cv11`,
  and `calt` enabled across every numeric and label.
- Hierarchy through scale + weight contrast. No divider lines as
  decoration; no box outlines as default.
- Shadows are hairline-and-halo, not drop-shadows; depth comes from a
  1 px alpha ring plus a soft 1–4 px ambient.
- Motion has one default curve (`ease`) and a four-step duration tier
  (`80 / 120 / 180 / 250 ms`), exposed as `--ds-duration-{fast, snap,
  medium, emphasized}`. Toast, dialog, and collapsible reach for the
  exponential `--ds-easing-snap`
  (`cubic-bezier(0.22, 1, 0.36, 1)`). Press feedback is a single
  `scale(0.98)` everywhere. Reduced motion respected.

## 2. Colors: The Sky-Over-Gray Palette

A single committed accent, sky blue, sits inside a palette of
near-neutral grays. The grays are warm-cool neutral (Radix Themes
`gray`), not blue-leaning, so they read as "paper" rather than as a
diluted brand color. The accent is reserved for selection, focus, and a
small set of solid actions; it is rare on purpose. All values are
expressed as the `--ds-*` token system, which resolves through Radix
Themes `gray-1..12` and `sky-1..12` (plus alpha siblings) under the
hood. The system runs on `light-dark()`, so every token is a single name
that flips with the theme.

### Primary

- **Sky Voice** (`#00a2c7` / `oklch(73.5% 0.13 220)`, token
  `--ds-accent-9`): the only accent color. Solid fills on accent
  buttons, focus-ring border, the `::before` halo on focused
  primitives, source-badge accents in special cases. Never a gradient.
  Never a background for whole sections.
- **Sky Quiet** (`#00718f` / `oklch(56% 0.11 220)`, token
  `--ds-accent-11`): low-contrast accessible accent text. Used for
  links, accent labels, and accent ghost-state foregrounds.

### Neutral

The Radix gray scale is the room. Read by step number, not by hex; the
hex below is the light-mode value.

- **Library Paper** (`#fcfcfc`, token `--ds-gray-1`): app background,
  the canvas the library sits on.
- **Shelf** (`#f9f9f9`, token `--ds-gray-2`): subtle surface.
  Sidebars, cards, popovers, the `Shell.main` panel that floats on
  the canvas with a 1 px hairline ring.
- **Resting UI** (`#f1f1f1`, token `--ds-gray-3`): the default fill of
  resting interactive elements (secondary button, hover background on
  many primitives).
- **Engaged UI** (`#e9e9e9`–`#e2e2e2`, tokens `--ds-gray-4`,
  `--ds-gray-5`): hovered and selected states for the same elements,
  one step at a time.
- **Hairline** (`var(--ds-gray-a4)` / approx `#0000001a`): subtle
  separators and the ring on the floating `Shell.main` panel. Always
  alpha-based so it composes correctly on any surface.
- **Border** (`var(--ds-gray-a6)`, approx `#00000033`): UI element
  borders for inputs and stronger separators.
- **Soft Ink** (`#646464`, token `--ds-gray-11`): secondary text,
  metadata, low-contrast accessible labels.
- **Hard Ink** (`#1b1b1b`, token `--ds-gray-12`): high-contrast text
  and icons. The book on the shelf.

### Semantic — Danger

- **Tomato Solid** (`#e54d2e`, token `--ds-tomato-9`): destructive
  intent indicator. Used for the required-field asterisk and the
  text-color on danger labels.
- **Tomato Wash** (`#fff0ee`, token `--ds-tomato-3`): danger button
  background. Lower-temperature destructive tint than solid red so it
  doesn't shout in a quiet room.

### Brand — Source Badges

Source identity (Twitter / X, Cosmos, Are.na, Pinterest, Facebook,
TikTok, YouTube, Dribbble, Instagram) is carried in a tiny dedicated
badge, never in the surrounding chrome. Each source uses its own
brand color as the badge background plus its glyph as the foreground;
identity is doubly-encoded so color blindness never erases it. The
Instagram badge uses its canonical conic-radial gradient; every other
badge is a flat brand fill. Source brand color never escapes the
badge into surrounding UI.

### Named Rules

**The One Voice Rule.** The accent (sky `--ds-accent-9`) appears on
≤10% of any given screen. Its rarity is the point. If a screen reads as
"the blue one," the accent has been used too many times.

**The No-Box-By-Default Rule.** Surfaces are flat tinted neutrals.
Borders are reached for sparingly, and when they're used, they are 1 px
alpha hairlines (`var(--ds-gray-a4)` or `--ds-gray-a6`), never a 2 px
solid line and never a colored stripe.

**The Tinted-Neutral Rule.** No raw `#000` or `#fff` ever. Every
neutral resolves through the `--ds-gray-*` scale (Radix), which is
already micro-tinted toward warm gray. Color-mix on the accent is
allowed (`color-mix(in srgb, var(--ds-accent-9) 20%, transparent)` for
focus halos), raw black/white are not.

## 3. Typography

**Display Font:** Inter Variable (with system fallbacks: `ui-sans-serif`,
`system-ui`, `-apple-system`, `'SF Pro Text'`, `'Segoe UI'`,
`sans-serif`).
**Body Font:** Inter Variable. One family carries the whole interface.
**Mono Font:** `ui-monospace, SFMono-Regular, Menlo, monospace` —
used only for inline `<code>` and the small set of identifier-leaning
strings (URLs in dev console, file paths in settings).

**Character.** Inter Variable at optical-size `opsz: 14` — its true
text grade — with `tnum`, `zero`, `cv11`, and `ss01` enabled by
default. The result is a quiet workhorse sans that disappears on body
copy and tightens on titles, with stylistic alternates (single-storey
`a` via `cv11`, slashed zero via `zero`, alternate `g` via `ss01`)
giving Pond a recognizable but uninsistent voice. Numerics are tabular
across the entire interface, so any column of dates, counts, or sizes
aligns clean. Letter-spacing is never tuned per-role — `opsz` already
balances spacing and contrast for each size, and a hand-set tracking
value would compound or fight it.

### Hierarchy

- **Display** (600, 20 px, line-height 1.2): the largest text in the
  app. Page titles in detail views, settings page headings.
- **Headline** (600, 16 px, line-height 1.3): section titles inside
  long pages. Used inside the `Settings.SectionTitle` and equivalent.
- **Title** (550, 13 px, line-height 1.4): the "active size" of the
  interface. Buttons, `Settings.ItemTitle`, list-row leads, save
  cards, command-palette items. The 550 weight sits between regular
  and semibold and holds the room without raising its voice.
- **Body** (500, 13 px, line-height 1.5): the default. Description
  text inside settings items, dialog body, ambient prose. Cap reading
  measure at 65–75ch where it appears as paragraphs.
- **Label** (550, 12 px, line-height 1.4, color
  `--ds-gray-11`/`Soft Ink`): form labels, group labels in select
  popups, secondary metadata. Sentence case, never UPPERCASE.

### Named Rules

**The Single Family Rule.** Inter Variable carries everything except
the rare inline `<code>`. Hierarchy is built from weight (500 → 550 →
600) and size (12 → 13 → 16 → 20), not from a second font. Avoid
introducing a serif, a slab, or a "display weirdness" font; the system
has no place for it.

**The Sentence Case Rule.** All UI text is sentence case. No
ALL-CAPS labels; no Title-Cased Headings. The room is quiet.

**The Tabular Number Rule.** `font-variant-numeric: tabular-nums` is
on by default in the global reset. Don't override it on lists,
counters, or anywhere a number could appear in a column.

## 4. Elevation

Pond is hairline-flat by default. Surfaces sit directly on the canvas;
depth is a 1 px alpha ring plus a soft ambient drop (1–4 px), never a
heavy drop-shadow and never a backdrop blur. The only place depth
escalates is when an element is focused (a sky-blue ring replaces the
gray ring) or popped over the canvas (`Shell.main` floats on a hairline,
popovers ride a slightly larger drop).

### Shadow Vocabulary

All shadows live in `theme.css` as `--ds-shadow-*` tokens. Two tiers:
the structural ring tier (used on resting elements like buttons and
inputs) and the floating-popup tier (used on surfaces that lift off
the canvas). Every shadow tints through `--ds-gray-aX` rather than
raw `rgba(0,0,0,X)` — the Tinted-Neutral Rule applies to shadows
too.

#### Structural ring tier

- **`--ds-shadow-1`** — default 1 px hairline + tiny ambient drop.
  Resting buttons, source-badge fallbacks, save cards.
- **`--ds-shadow-2`** — slightly lifted hairline + 2 px drop. Inputs,
  the floating `Shell.main` panel.
- **`--ds-shadow-2-focused`** — focused-input lift: replaces the gray
  ring with `--ds-accent-9` and adds the alpha-20% sky halo
  (`color-mix(in srgb, var(--ds-accent-9) 20%, transparent)`).
  The input version of the signature focus halo.
- **`--ds-shadow-3`** — slightly heavier hairline + 4 px drop.
  Used on dense floating chrome that wants more lift than `-2` but
  not full popover weight.

#### Floating-popup tier

- **`--ds-shadow-popover`** — menu, popover, context-menu, select
  popup surface elevation.
- **`--ds-shadow-dialog`** — modal dialogs. Heavier 32 px ambient.
- **`--ds-shadow-toast`** — toast viewport. Sits directly on the
  canvas at bottom-right.
- **`--ds-shadow-tooltip`** — tooltip lift. Tighter 16 px drop.

#### Atomic helpers

- **`--ds-shadow-thumb`** — switch thumb / draggable handle drop.
- **`--ds-shadow-badge`** — source-badge inset hairline.
- **`--ds-shadow-focus-halo`** — the bare halo (1 px sky ring +
  3 px sky alpha-20%) used inside `::before` on Button, Select
  trigger, Switch. Same visual concept the input shadow embeds.

### Named Rules

**The Hairline-First Rule.** The default elevation in this system is a
1 px alpha ring + 1–4 px ambient drop. If you find yourself reaching
for a 12 px drop-shadow, the element wants a different solution
(probably a flatter surface step), not a heavier shadow.

**The No-Glass Rule.** Glassmorphism (backdrop blur on translucent
surfaces) is forbidden as decoration. The only acceptable use is when
content must be readable through a moving background (none such surface
exists in Pond today). Default surfaces are opaque tinted neutrals.

## 5. Components

Every primitive in `packages/ui` follows the same shape: a compound
component object (`Button`, `Select`, `Field`, …) made of small named
sub-components, all wired through Base UI's headless primitives, all
styled with co-located CSS Modules and `data-*` attribute variants. The
character below describes the visual vocabulary, not the component
shape.

Two kinds of style live in `packages/ui/src/lib/`:

- **`popup.module.css`** — the shared menu/select popup vocabulary.
  Menu, Popover, ContextMenu, and Select all import `.popup`,
  `.item`, `.item-icon`, `.item-label`, `.item-kbd`, `.indicator`,
  `.group-label`, and `.separator` from this module so the four
  surfaces stay visually coherent. Density variants (`.popup-compact`,
  `.item-compact`) drop Menu/ContextMenu items to 28 px while
  Popover/Select stay at 32 px.
- **`control.module.css`** — the shared form-control styles consumed
  by `Input` and `Field.Control`. Same 32 px height, padding,
  resting `--ds-shadow-2`, and focused `--ds-shadow-2-focused` halo.

### Buttons

- **Shape.** Radius is `--button-radius: 100px` (full pill) for every
  variant and every size. Pond's buttons are pills, deliberately —
  it's the small piece of warmth in an otherwise rectilinear system.
- **Sizes.** `xs` (24×24, 10 px text), `sm` (28×28, 11 px text), `md`
  (32×default, 13 px text), `lg` (36×default, 15 px text). Padding
  scales with size; icon-only buttons square off via
  `aspect-ratio: 1 / 1`.
- **Primary.** White-on-paper background (`--ds-background-primary`),
  hard-ink text (`--ds-gray-12`), 1 px gray-3 ring + 1 px gray-3
  bottom shadow. Hovers to gray-2, presses to gray-3 with
  `transform: scale(0.98)`.
- **Secondary.** Gray-3 surface (`Resting UI`), soft-ink text. Hovers
  to gray-4, presses to gray-5; text deepens to hard ink on hover.
- **Tertiary.** Transparent surface, soft-ink text. Hovers to gray-2;
  presses to gray-3. Used in toolbars and dense rows where a chrome'd
  button would be too loud.
- **Accent.** Sky-9 fill, white text. Hover dims via opacity (0.6)
  rather than darkening — Pond doesn't color-mix the accent into a
  second shade. Press via opacity (0.8). Reserved for the single
  primary action on a screen.
- **Danger.** Tomato-3 wash, tomato-11 text. Hover and press shift one
  step to tomato-4; the tomato never goes solid red. Destructive
  actions look serious without shouting.
- **Focus ring.** Drawn as a `::before` pseudo-element offset by
  −4 px around the button, with `box-shadow: var(--ds-shadow-focus-halo)`.
  Visible only on `:focus-visible`. The same halo concept is embedded
  inside `--ds-shadow-2-focused` for elements that can't render
  pseudo-elements (the leaf `<input>`).
- **Press feedback.** `transform: scale(0.98)` on `:active`,
  transitioned with `all 0.18s ease`. The whole system uses this one
  curve.

### Inputs / Fields

- **Style.** Transparent background, 32 px tall, 14 px horizontal
  padding, `--ds-radius-sm` (10 px) corners. The input does not draw
  its own background; instead, the `--ds-shadow-2` (Lifted Hairline)
  describes its boundary as a 1 px alpha ring + soft drop. This keeps
  inputs visually weightless on a quiet page.
- **Placeholder.** `--ds-gray-8` (a low-contrast gray that survives
  AA when used only as input affordance).
- **Focus.** Box-shadow morphs from `--ds-shadow-2` (gray ring) to
  `--ds-shadow-2-focused` (sky-9 ring + 3 px alpha-20% halo + gray
  drop). The border doesn't thicken — color carries the state.
  Same halo concept as Button/Select.trigger; rendered inline on the
  input because `<input>` can't host `::before`.
- **Disabled.** `cursor: not-allowed; opacity: 0.5`. Standard.
- **Field labels.** 12 px, 550, soft-ink color. The required-field
  marker is a single tomato `*` appended via `:has(:required)`; never a
  block of red text.
- **Field description / error.** 12 px, soft-ink for description, 12
  px / 550 / tomato-9 for error. Stacked under the control with 8 px
  gap from `Field.Root`.

### Select Triggers

- **Shape.** 36 px tall, 13 px horizontal padding, 12 px corners
  (`--ds-radius-md`). Min-width 128 px so triggers sit at consistent
  sizes in a row of filters.
- **Resting.** Transparent background, hard-ink value text, soft-ink
  chevron, 1 px hairline ring (`--ds-shadow-1`). The trigger looks
  more like a tag than a form field — appropriate for the way Pond
  uses Select (sort, filter, layout switches), not for "tell us your
  country."
- **Hover / Open.** Background fades to `--ds-gray-2`. The
  `[data-popup-open]` state holds the same hovered look while the
  popup is open, so the visual chain reads cleanly.
- **Active.** `--ds-gray-3` plus `transform: scale(0.99)`.
- **Focus.** Same outset `::before` halo as buttons (sky-9 + 2 px
  alpha-20%) — focus visibility is one pattern, not five.

### Select Popups

- **Surface.** `--ds-background-secondary` (gray-1) with a 12 px
  corner and `--ds-shadow-3` (Popover) elevation.
- **Items.** 13 px text, 8 px vertical padding, 12 px horizontal,
  arranged in a `1fr 12px` grid so the indicator column lines up
  across the list. Highlighted items render a 4 px-inset gray-2
  pill behind themselves via `::before`, so the highlight feels
  inset, not stamped on.
- **Group labels.** 12 px / 500, gray-10, sticky to the top of the
  list while it scrolls. Inside dense source pickers this keeps the
  category header visible while the user arrows through.
- **Separators.** 1 px gray-a3, never a thicker line.
- **Open animation.** `opacity 0 → 1` and `scale(0.9) → 1`, 0.18s
  ease, anchored to the trigger via `transform-origin`. Closed mirrors
  open. No bounce.

### Source Badges

- **Shape.** Small rounded square (size determined by `data-size`:
  `sm`, `md`, `lg`), brand-colored background, white or near-black
  glyph foreground. Some badges (Cosmos, Are.na) opt into a 1 px
  alpha ring via `data-ring="true"` because their backgrounds are
  near-white.
- **Identity.** Source identity is doubly-encoded as background
  color + SVG glyph, so colorblind users still recognize Twitter vs.
  Pinterest from the mark.
- **Containment.** Brand color stays inside the badge. It never
  escapes into the row, the card, or the surrounding chrome.

### Settings (signature primitive)

The compound component most worth documenting in its own right.
`Settings` is the canonical reference for every other primitive in the
codebase: `Settings.Page` → `Settings.Header` → `Settings.Title` /
`Settings.Description` → `Settings.Section` → `Settings.SectionTitle` →
`Settings.List` → `Settings.Item` (`ItemDetails` / `ItemTitle` /
`ItemDescription` / `ItemControl`).

- **Width.** `data-width` chooses between `narrow` (384), `medium`
  (640), `wide` (1024) via a CSS variable on the root.
- **Rhythm.** Sections are stacked with a 40 px gap; items use 8 px
  internal gap; description text is 12 px / soft ink. The hierarchy
  is built from variation in spacing, not from divider lines or
  cards-in-cards.
- **Item layout.** Title + description on the left, control on the
  right. The control sits flush, no card wrapper.
- **Anti-pattern check.** Items never wrap themselves in a card
  (nested-cards-are-always-wrong). The settings page IS the surface;
  rows are rows.

## 6. Do's and Don'ts

### Do

- **Do** read tokens through `--ds-*`. Every color, radius, shadow,
  and brand-source surface resolves via the design-system token
  system. No raw hex, no ad-hoc per-page palettes.
- **Do** use `light-dark()` for any value that should respond to the
  theme, instead of writing `[data-theme="dark"]` overrides.
- **Do** build hierarchy from weight + size contrast (≥1.25 ratio
  between steps) and from spacing rhythm, not from divider lines or
  borders.
- **Do** keep accent (sky `--ds-accent-9`) at ≤10% of any given
  screen. The One Voice Rule.
- **Do** respect `prefers-reduced-motion` on every new motion. The
  shell already gates view-transitions this way; mirror the pattern.
- **Do** double-encode source identity (brand color **and** glyph)
  on every source badge.
- **Do** put focus visibility on a `:focus-visible` outset
  `::before` halo (1 px sky-9 + 2 px sky-9 alpha-20%). It is the
  signature focus pattern of the system.
- **Do** keep one motion vocabulary: `transition: all 0.18s ease`
  and `transform: scale(0.98–0.99)` for press. Open/close with
  opacity + scale, anchored to the right transform-origin.
- **Do** keep numerics tabular. Tabular-nums is on by default; don't
  override it.

### Don't

- **Don't** introduce a hero-metric block — big number, small label,
  supporting stats, gradient accent. The SaaS-dashboard cliché has
  no place in a library.
- **Don't** use gradient text (`background-clip: text` over a
  gradient). Single solid colors only; emphasis comes from weight or
  size.
- **Don't** use glassmorphism by default. Backdrop blur on
  translucent panels is the AI-tool reflex; surfaces are opaque
  tinted neutrals here.
- **Don't** use a `border-left` or `border-right` greater than 1 px
  as a colored accent stripe on cards, list items, callouts, or
  alerts. Rewrite with a tinted background, a leading badge, or
  nothing.
- **Don't** wrap a row in a card "for emphasis." If a row needs to
  stand out, vary spacing and weight, not the box.
- **Don't** nest cards. Nested cards are always wrong in this
  system.
- **Don't** UPPERCASE labels or Title-Case headings. Sentence case is
  the room's voice.
- **Don't** reach for raw `#000` or `#fff`. Every neutral resolves
  through `--ds-gray-*`, which is micro-tinted toward warm gray.
- **Don't** use the brand source colors (Twitter, Pinterest, Are.na,
  …) outside the source badge. They are identity colors, not surface
  colors.
- **Don't** style anything with Tailwind, `cva`, `styled-components`,
  CSS-in-JS, or inline `style={{}}` inside `packages/ui` or
  `apps/desktop/src/renderer/src/components`. CSS Modules with
  kebab-case classes and `data-*` variants only. Page-level glue is
  the only inline-style exception.
- **Don't** treat dark as the default theme. Theme is decided by
  `light-dark()` and respects the system. Both ship at AA.
- **Don't** introduce a second font family. Inter Variable carries
  everything; the only escape is `ui-monospace` for inline `<code>`.

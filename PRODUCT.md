# Product

## Register

product

## Users

Generalists who save a lot from the open web. The shared trait isn't the
job title; it's the habit. Designers harvesting visual references on
Are.na, writers building a reading pile, developers stockpiling links to
revisit, taste-collectors keeping a running notebook of things they
liked. Their saves are scattered across Twitter likes, Instagram
collections, Pinterest boards, Cosmos clusters, TikTok favorites,
YouTube watch-later, and a thousand browser bookmarks. They want one
local home for all of it.

Mac-first power users. Pond ships as a `.dmg` and a Homebrew cask, lives
in `~/Pond/My Pond.library/` on disk, and is owned and tended by the
user, not synced from a server. The browser extension feeds a local HTTP
server on `127.0.0.1:41610`. Nothing leaves the machine unless the user
chooses to.

Two characteristic moments: the quick save (a tab, a tweet, a pin —
captured via the extension and forgotten) and the slower retrieval
(opening Pond on a Sunday afternoon to find that thing they saved last
March). The interface has to be uneventful at the first and rewarding
at the second.

## Product Purpose

A local-first archive for everything you save across the open web. Three
first-class jobs, none of them subordinate:

- **Curate.** Build and revisit a personal reference library. Browse,
  group, find again later by feel.
- **Archive.** Own your saves locally so platform decay can't take
  them. Deleted tweets, dead links, vanished Are.na accounts: still
  yours.
- **Search.** Make everything findable. Full-text across articles,
  metadata across saves, tags, filters, AI search.

Success: you stop forgetting what you saved. The pile turns into a
library.

## Brand Personality

**Considered, calm, taste-led.** Three words.

Voice: precise, quiet, not promotional. Closer to a field notebook than
a marketing site. Pond does not need an exclamation point. It does not
celebrate features. It does not say "powered by AI." When it speaks, it
says the smallest accurate thing.

Tone: respectful of attention. The interface assumes the user has good
taste and a finite amount of time. It explains what it has to and stops.

Emotional goal: the quiet relief of having a private, well-kept place.
The confidence that what you saved is yours and will be findable.

## Anti-references

What Pond should explicitly not feel like:

- **Social feeds.** Infinite scroll, engagement chrome, addictive UI.
  Pond is finite by design.
- **Generic SaaS dashboards.** Cards-everywhere, hero-metric blocks
  (big number, small label, supporting stats), gradient accents. The
  visual reflex of "B2B tool" is the wrong reflex for an archive.
- **Notion-everything sprawl.** Three different surfaces that all do
  the same job, infinite database views, blocks-of-blocks.
- **Pocket / Pinboard / read-it-later graveyard.** The dated
  utilitarian aesthetic where saves go to die. Pond is a library, not
  a holding pen.
- **AI-generated dashboard slop.** Sky-blue gradients, glass blur,
  restated headings (the page title, then the page title again as a
  sentence), the hero-metric template, identical card grids. If the
  page could be a screenshot in a "Designed with AI" landing page, it
  is wrong.
- **Bubbly consumer-warm.** Rounded blobs, mascots, pastels,
  illustrations of friendly characters with three-pixel mouths. Pond
  is not a productivity buddy.

## Design Principles

Five strategic principles that should hold across every surface.

1. **Library, not feed.** Content is finite and personal. Optimize for
   "I'm looking for that thing I saved last March," not for
   browsing-as-pastime. No infinite scroll without an end. No engagement
   metrics. The user already wanted these things; the app's job is to
   give them back, not to keep them looking.

2. **Local is the source of truth.** Every interaction reinforces
   ownership. The library folder on disk is canonical; the SQLite index
   is rebuildable. Pond never says "syncing…" because Pond never asks
   the user to trust a server. If the index is gone, Pond rebuilds it
   from the library on next launch.

3. **Survive platform decay.** Assume the original source disappears.
   When a tweet is deleted, an Are.na block is removed, an Instagram
   account vanishes — the saved version stays, with the same metadata,
   tags, and confidence as a live one. The archived snapshot is
   first-class, not a fallback.

4. **Density without noise.** Power users have hundreds to thousands
   of items. The interface earns its room through rhythm, hierarchy,
   and typography, not through boxes-everywhere or aggressive color.
   Variants are reached for sparingly. The default surface is calm.

5. **Keyboard-first, mouse-fluent.** Every action has a key. The
   command palette is the canonical fast path; the GUI exists for
   browsing, recall, and discovery, not as a speed cap. Mouse and
   trackpad work everywhere, but a power user should never need them.

## Accessibility & Inclusion

- **WCAG 2.2 AA across the board.** 4.5:1 minimum contrast for body
  text, 3:1 for UI elements and large text. Color is never the only
  signal — source identity is carried by both the brand color and the
  glyph icon.
- **Full keyboard navigation everywhere.** Every interactive surface
  reachable via tab + arrows + the command palette. Focus is visible
  at every step; the existing outset-halo focus pattern (`::before`
  with `--ds-accent-9`) is preserved across primitives.
- **Light and dark are both first-class.** Both ship at AA. Dark is
  not the default; theme is decided by `light-dark()` and respects the
  system. No "dark because tools look cool dark."
- **Respect `prefers-reduced-motion`.** Existing view-transition CSS
  already disables animation under this preference; new motion follows
  the same gate.
- **Tabular numerics throughout.** `font-variant-numeric: tabular-nums`
  is on by default in the reset, so any list of saves with counts,
  dates, or sizes aligns column-clean for readers who scan.

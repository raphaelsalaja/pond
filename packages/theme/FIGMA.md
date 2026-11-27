# Figma

Pond keeps a small Figma setup, the way Linear does: the code is the design system, and Figma is a sketchpad that mirrors it. A design is a reference for building, never the spec.

## Files

All files live in the Pond project in Figma. Past quarter files move to a separate Pond Archive project.

| File | Holds |
| --- | --- |
| [Pond — System](https://www.figma.com/design/XRnKal5ssnzQra25OlhmSv) | Variables, text styles, and shadows mirrored from this package. Published as the library every other file uses. |
| [Pond — 2026 Q4](https://www.figma.com/design/h2kHc5ARTfgV8m5f9phyya) | Working file for the quarter. One page per piece of work, named with the [domain language](../../AGENTS.md#domain-language), copied from its Template page. Each page has a brief, then three sections: 1 · Now (screenshots of the app), 2 · Explore, 3 · Ready to build. A new file each quarter. |
| [Pond — Brand](https://www.figma.com/design/dOs2gEaZJlq2DkGsERJxLU) | Mark and Wordmark components (from `packages/icons/brand/icon.svg` and `packages/ui/src/wordmark`), the 13 app icon tints, one component per Fish species (from `SPECIES_ART` in the desktop app), favicons and extension icons. App icons are flat stand-ins; the real ones are Icon Composer files in `packages/icons/brand/tints`. |
| [Pond — Website](https://www.figma.com/design/z8OMMFXSFgwMeXXEhvAT2G) | Home, with a section map naming each component in `apps/website/app/components` and its copy from `content/home.ts`; the other routes; the OG image as `opengraph-image.tsx` renders it; Chrome Web Store assets at the store's sizes. |

When an agent builds from a design, it reads only the **3 · Ready to build** section of a work page, and the plan or PR named in that page's brief.

## How the System file maps to code

Every variable carries its CSS name as WEB code syntax, so `get_variable_defs` and `get_design_context` return `var(--ds-…)` instead of a hex value. Always write the `var()`.

| Figma | CSS |
| --- | --- |
| `background/primary`, `surface/*`, `border/*`, `foreground/*` | `--ds-background-primary`, `--ds-surface-*`, … |
| `accent/default`, `accent/hover`, `accent/tint` | `--ds-accent`, `--ds-accent-hover`, `--ds-accent-tint` |
| `danger/*` | `--ds-danger`, `--ds-danger-*` |
| `palette/red/default`, `palette/red/tint` | `--ds-red`, `--ds-red-tint` |
| `media/*`, `overlay/scrim` | `--ds-media-*`, `--ds-scrim` |
| `space/*`, `radius/*`, `size/*` | `--ds-space-*`, `--ds-radius-*`, `--ds-size-*` (`size/title-bar` is `--ds-title-bar-height`) |
| `text/body/size`, `text/body/leading`, `weight/*` | `--ds-text-body`, `--ds-leading-body`, `--ds-weight-*` |
| Text style `Body/Medium` | `--ds-text-body` and `--ds-leading-body` at `--ds-weight-medium` |
| Effect style `Shadow/Menu` | `--ds-shadow-menu` |

The Color collection has Light and Dark modes, holding the default theme's values from `DEFAULT_THEMES` in [ramps.ts](src/colors/ramps.ts), in sRGB. The app also ships P3 values and recolors the accent from settings; Figma shows only the defaults.

Known gaps:

- The app's UI font is Allo with Inter as fallback. Figma uses Inter until Allo is installed; then change `font/ui` in the Type collection.
- Shadow effect styles hold light-theme values. Dark shadows live in [shadow.css](src/shadow/shadow.css).
- Figma has no 450 or 550 weight in Inter, so the text styles use Regular, Medium, and Semi Bold.

## Re-syncing after a token change

1. Change [tokens.ts](src/colors/tokens.ts) or [ramps.ts](src/colors/ramps.ts), then run `pnpm --filter @pond/theme generate`.
2. Print the new values from `packages/theme`:

   ```bash
   node -e 'import("./src/colors/ramps.ts").then(async ({ DEFAULT_THEMES }) => { const { buildThemeTokens } = await import("./src/colors/tokens.ts"); console.log(JSON.stringify({ light: buildThemeTokens(DEFAULT_THEMES.light, "srgb").tokens, dark: buildThemeTokens(DEFAULT_THEMES.dark, "srgb").tokens })) })'
   ```

3. In Pond — System, update each variable in place, found by its code syntax. Never delete and recreate a variable: that breaks every binding in every file that uses the library.
4. Add a variable only when the token is new in code. Set its WEB code syntax to `var(--ds-…)`, its scopes, and a one-line description of where it's used.
5. Update the date on the Cover and publish the library.

## Components

The System file has no components yet, on purpose. Add one only once you design with it often. Name it after its folder in `packages/ui/src`, bind every property to variables, and link it with Code Connect so agents get the real import.

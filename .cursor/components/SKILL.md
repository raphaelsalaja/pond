---
name: components
description: Build React components in the Pond house style — compound component objects, CSS Modules, variants via data-attributes, props that extend native HTML elements. Use when creating, refactoring, or reviewing any component under apps/desktop/src/renderer/src/components/, ui/, or pages/. Triggers on /components or when the user asks to "make a component", "refactor this to match Settings", "follow the component convention", or asks how components should be structured in this codebase.
---

# /components: component patterns in the Pond house style

## Quick start

The reference implementation lives in `apps/desktop/src/renderer/src/components/settings/`. Read it first. Every new component in this codebase should follow the same shape:

1. One folder per component: `<name>/index.tsx` + `<name>/styles.module.css`.
2. Export a single PascalCase object whose keys are the sub-components (`Settings.Page`, `Settings.Header`, `Settings.Item`, ...).
3. Every sub-component is a thin function whose props extend a native HTML element via `React.ComponentPropsWithoutRef<"tag">`.
4. Variants are `data-*` attributes, never boolean props. CSS targets them with `&[data-x="y"]`.
5. Co-located CSS Modules. No inline styles. No styling props (`className` may still be passed in via `...props`).
6. Use semantic HTML. `<header>` for headers, `<h1>`–`<h3>` by hierarchy, `<p>` for body, `<div>` only for layout primitives.

If a new component matches these six rules, it's correct. The rest of this file is the reasoning, the exact patterns to follow, and the things to avoid.

## The reference: Settings

```77:90:apps/desktop/src/renderer/src/components/settings/index.tsx
export const Settings = {
  Page: Page,
  Header: Header,
  Title: Title,
  Description: Description,
  Section: Section,
  SectionTitle: SectionTitle,
  List: List,
  Item: Item,
  ItemDetails: ItemDetails,
  ItemTitle: ItemTitle,
  ItemDescription: ItemDescription,
  ItemControl: ItemControl,
};
```

Each sub-component is one declarative function, defined in the same file, paired with a typed props interface.

```3:9:apps/desktop/src/renderer/src/components/settings/index.tsx
interface PageProps extends React.ComponentPropsWithoutRef<"div"> {
  width?: "narrow" | "medium" | "wide";
}

function Page({ width = "medium", ...props }: PageProps) {
  return <div data-width={width} className={styles.page} {...props} />;
}
```

A consumer composes these like LEGO. No options, no `variant` props, no `as` props, no nested config objects.

```14:21:apps/desktop/src/renderer/src/pages/settings/sections/notifications.tsx
<Settings.Page>
  <Settings.Header>
    <Settings.Title>Notifications</Settings.Title>
    <Settings.Description>
      Choose which background events surface as a toast.
    </Settings.Description>
  </Settings.Header>
```

## Rules

### 1. One folder, two files

```text
components/<name>/
  index.tsx
  styles.module.css
```

No `types.ts`, no `<name>.tsx`, no `Component.tsx`. The folder name is the import name.

```ts
import { Settings } from "../../../components/settings";
```

If a component grows past ~250 lines, split sub-components into sibling files (`item.tsx`, `header.tsx`) and re-export them from `index.tsx`. Keep the public surface a single object.

### 2. Compound component object

Always export a single PascalCase object. Never export the sub-components individually.

Good:

```tsx
export const Settings = {
  Page,
  Header,
  Title,
};
```

Bad:

```tsx
export { Page, Header, Title };
```

This keeps the namespace obvious at the call site (`<Settings.Page>` reads like a sentence) and lets you rename internals without churning every consumer.

### 3. Props extend the underlying HTML element

Every sub-component declares a props interface that extends the exact element it renders.

```tsx
interface SectionProps extends React.ComponentPropsWithoutRef<"div"> {}

function Section({ ...props }: SectionProps) {
  return <div className={styles.section} {...props} />;
}
```

Even when the interface is empty, declare it. It documents which element this component is, and lets you add props later without changing the call signature.

Use `React.ComponentPropsWithoutRef<"tag">`, not `HTMLAttributes<HTMLDivElement>`. The former handles `ref`, `key`, and event types correctly for the specific tag.

### 4. Variants are `data-*` attributes, not boolean props

When a component has visual variants, expose them as a single string-union prop and forward it as a `data-*` attribute. Style with attribute selectors.

```tsx
interface PageProps extends React.ComponentPropsWithoutRef<"div"> {
  width?: "narrow" | "medium" | "wide";
}

function Page({ width = "medium", ...props }: PageProps) {
  return <div data-width={width} className={styles.page} {...props} />;
}
```

```css
.page {
  &[data-width="narrow"] { --settings-max-width: 384px; }
  &[data-width="medium"] { --settings-max-width: 640px; }
  &[data-width="wide"]   { --settings-max-width: 1024px; }
}
```

This works because it:

- Stays declarative in the DOM (you can inspect the variant in DevTools).
- Avoids prop explosion (`compact`, `large`, `dense`, `inverted`...).
- Lets a parent override styling via CSS without touching the component.

If you find yourself adding `boolean` props to switch behavior, stop and turn them into a `data-*` variant or split the component.

### 5. Spread `...props` last

Always destructure your custom props and spread the rest onto the element.

```tsx
function Page({ width = "medium", ...props }: PageProps) {
  return <div data-width={width} className={styles.page} {...props} />;
}
```

This lets a consumer pass `id`, `aria-*`, `data-testid`, event handlers, and even `className` (which will replace yours — accept that and merge with `clsx` only when necessary).

### 6. Semantic HTML by role

Pick the tag that matches the role, not the layout.

| Role | Tag |
| --- | --- |
| Page heading | `<h1>` |
| Section heading | `<h2>` |
| Item heading | `<h3>` |
| Body / description | `<p>` |
| Header band | `<header>` |
| Generic layout box | `<div>` |
| Interactive control | `<button>` / `<input>` (from `ui/`) |

The Settings file uses `h1`/`h2`/`h3`/`p`/`header` deliberately. Mirror this in any component that has the same hierarchy. Don't reach for `<div>` because "it's just text".

### 7. CSS Modules, co-located, kebab-case classes

- One `styles.module.css` per component, in the same folder.
- Import as `import styles from "./styles.module.css";`.
- Class names are kebab-case (`section-title`, `item-description`).
- Access via `styles.foo` for single-word names, `styles["section-title"]` for multi-word.

```tsx
<h2 className={styles["section-title"]} {...props} />
```

Don't use Tailwind, `styled-components`, `cva`, inline `style={{ ... }}`, or `clsx` on internal classes. The few `style={{ ... }}` blocks you'll find in pages (e.g. `preferences.tsx`) are page-level glue, not component primitives — don't propagate them into new components.

### 8. CSS custom properties for tokens, locals on the root

Use design-system tokens for every color, never raw hex. Define component-local variables on the root class so callers can override them from the outside without writing component-specific CSS.

```css
.page {
  --settings-padding-inline-inset: 16px;
  --settings-margin-top: 64px;

  display: flex;
  flex-direction: column;
  gap: 40px;
  margin-top: var(--settings-margin-top);
}

.header {
  padding-inline: var(--settings-padding-inline-inset);
}
```

Locals live at the top of the root class, in declaration order. Token reads (`var(--ds-gray-12)`) live wherever they're needed.

#### Tokens: always use `--ds-*`

All theme tokens live in `packages/ui/src/theme.css` (re-exported as `@pond/ui/theme.css`). There is one system: `--ds-*`. Don't reach for ad-hoc colours, hex literals, or page-local hand-rolled scales.

- **Color scales.** Backed by Radix Themes — `--ds-gray-1`…`--ds-gray-12` plus alpha (`--ds-gray-a1`…`--ds-gray-a12`), and `--ds-accent-1`…`--ds-accent-12` (sky-based) plus alpha. Same scale, same semantics in light and dark.
- **Surface.** `--ds-background-color` for the app body. Use `--ds-gray-1` for default surface, `--ds-gray-2` for subtle panels.
- **Radius.** `--ds-radius-sm` (4px), `--ds-radius-md` (6px), `--ds-radius-lg` (8px), `--ds-radius-xl` (12px).
- **Shadows.** `--ds-shadow-card`, `--ds-shadow-search`, `--ds-shadow-badge`.
- **Brand.** `--ds-brand-twitter`, `--ds-brand-cosmos`, `--ds-brand-reddit`, `--ds-brand-arena`, `--ds-brand-facebook`, `--ds-brand-pinterest`, `--ds-brand-dribbble` for source-badge surfaces.

Radix scale cheat-sheet for picking the right step:

| Step | Use for |
| --- | --- |
| 1 | App background |
| 2 | Subtle background (cards, panels) |
| 3 | UI element background (resting) |
| 4 | Hovered UI element background |
| 5 | Active / selected UI element background |
| 6 | Subtle separators |
| 7 | UI element borders |
| 8 | Hovered borders, focus rings |
| 9 | Solid backgrounds (buttons, badges) |
| 10 | Hovered solid backgrounds |
| 11 | Low-contrast accessible text |
| 12 | High-contrast text |

Common picks for everyday situations:

| Need | Token |
| --- | --- |
| High-contrast text and icons | `--ds-gray-12` |
| Soft secondary text | `--ds-gray-11` |
| Hover background (composes on any surface) | `--ds-gray-a3` |
| Selected / pressed background | `--ds-gray-a4` |
| Focus rings, hovered borders | `--ds-accent-8` |
| Solid accent (button, link) | `--ds-accent-9` |
| Subtle separators | `--ds-gray-a4` |
| UI element borders | `--ds-gray-a6` |
| Subtle accent tint (pill, avatar swatch) | `--ds-accent-3` |

### 9. Defaults at destructure, not in JSX

```tsx
function Page({ width = "medium", ...props }: PageProps) {
```

Not:

```tsx
function Page(props: PageProps) {
  const width = props.width ?? "medium";
  ...
}
```

The destructure form is the same line count, types correctly, and shows the default in the signature.

### 10. No JSDoc on primitives, prose where intent matters

Sub-components like `Settings.Item` don't need JSDoc — the name and the props say it all. Reserve doc comments for non-obvious behavior, like the notifications section explaining how toast categories map to the `useToast` wrapper.

```5:10:apps/desktop/src/renderer/src/pages/settings/sections/notifications.tsx
/**
 * Notifications section. Each switch maps to a `category` tag the
 * shared `useToast()` wrapper checks before rendering — see
 * `apps/desktop/src/renderer/src/ui/toast.tsx`. Untagged toasts
 * (system errors, IPC failures) always show.
 */
```

Don't comment what the JSX already says. Do comment why a piece of state or an effect exists.

## Component skeleton

Use this as the starting point for a new compound component. Replace the name and the sub-components.

```tsx
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  variant?: "default" | "muted";
}

function Root({ variant = "default", ...props }: RootProps) {
  return <div data-variant={variant} className={styles.root} {...props} />;
}

interface HeaderProps extends React.ComponentPropsWithoutRef<"header"> {}

function Header({ ...props }: HeaderProps) {
  return <header className={styles.header} {...props} />;
}

interface TitleProps extends React.ComponentPropsWithoutRef<"h2"> {}

function Title({ ...props }: TitleProps) {
  return <h2 className={styles.title} {...props} />;
}

export const Card = {
  Root,
  Header,
  Title,
};
```

```css
.root {
  --card-padding: 16px;

  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background-color: var(--ds-gray-2);
  box-shadow:
    0 0 0 1px var(--ds-gray-a4),
    0 2px 4px 0 rgba(0, 0, 0, 0.06);

  &[data-variant="muted"] {
    background-color: transparent;
    box-shadow: 0 0 0 1px var(--ds-gray-a4);
  }
}

.header {
  padding: var(--card-padding);
}

.title {
  font-size: 13px;
  font-weight: 550;
  color: var(--ds-gray-12);
}
```

## Anti-patterns

These are the things to refuse in code review or rewrite when refactoring an older component.

- **Boolean prop walls.** `compact`, `large`, `dense`, `bordered`, `noPadding`. Collapse them into one `variant`/`size`/`density` `data-*` attribute or split the component.
- **`as` props.** If a consumer needs a different element, give them a different sub-component (`Settings.Title` vs `Settings.SectionTitle`), not polymorphism.
- **Default exports.** Always named, always the compound object.
- **Single-component files exporting many primitives.** Wrap them in the object.
- **Inline `style={{ ... }}` inside the component.** Allowed only as page-level glue; never inside `components/`.
- **Tailwind classes, `cva`, `tw\`...\``, or any CSS-in-JS.** Use CSS Modules.
- **Raw hex colors.** Always `var(--ds-...)` tokens.
- **`--pond-*` tokens.** Removed. Everything is `--ds-*` now.
- **`className` overrides as the primary customization API.** Variants first, `...props` (which includes `className`) as escape hatch.
- **Wrapping a primitive in a `<div>` "just to add padding".** Add a local `--*-padding` variable on the root and use it.
- **Hardcoded widths or breakpoints inside a sub-component.** Use a `data-*` variant on the root and let the root drive layout via CSS variables (see `Settings.Page`'s `--settings-max-width`).

## Naming

| Surface | Convention | Example |
| --- | --- | --- |
| Folder | kebab-case | `header-toolbar/` |
| Compound object | PascalCase, singular | `HeaderToolbar`, `Settings`, `Card` |
| Sub-component | PascalCase | `Page`, `ItemDetails` |
| Props interface | `<Component>Props` | `ItemDetailsProps` |
| CSS class | kebab-case | `item-description` |
| Local CSS variable | `--<component>-<name>` | `--settings-padding-inline-inset` |
| Variant value | lower-case word | `narrow`, `muted`, `compact` |

## Checklist

Before you commit a new component, walk this list:

- [ ] One folder, `index.tsx` + `styles.module.css`.
- [ ] Single named export of a PascalCase compound object.
- [ ] Every sub-component has a `<Name>Props` interface that extends `React.ComponentPropsWithoutRef<"tag">`.
- [ ] Every sub-component spreads `...props` onto its element.
- [ ] No boolean variants — use `data-*` attributes with a string union.
- [ ] Every variant is reflected as a `data-*` attribute on the rendered element.
- [ ] Semantic tags chosen by role (`<header>`, `<h1>`–`<h3>`, `<p>`, `<button>`).
- [ ] No inline styles, no Tailwind, no CSS-in-JS.
- [ ] All colors, radii, shadows, and brand surfaces via `var(--ds-...)` tokens. No raw hex. No `--pond-*` tokens.
- [ ] Component-local CSS variables declared on the root class, used inside children.
- [ ] No JSDoc on primitives; comments only where intent isn't obvious.
- [ ] Reads like the Settings reference at the call site.

## When NOT to apply this skill

The compound-component pattern is the default for **presentational primitives** under `components/` and `ui/`. It is *not* the default for:

- **Page components** under `pages/`. Pages are top-level, single-purpose, and may freely use hooks, effects, and inline `style={{ ... }}` for one-off glue.
- **Hooks and pool modules** under `pool/`. They follow normal hook conventions.
- **Main-process and preload code** under `apps/desktop/src/main/` and `apps/desktop/src/preload/`. They have nothing to do with this skill.
- **Single-element wrappers** that genuinely have no sub-parts (e.g. a one-off `Spinner`). A single named function export is fine; you do not need to invent sub-components to satisfy the pattern.

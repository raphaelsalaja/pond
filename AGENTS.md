# AGENTS.md

Project-wide rules for AI coding agents working in this repo. Skills under
`.cursor/` cover specific surfaces (components, copy). This file covers
the things that apply everywhere.

## Comments

Use comments sparingly. The default is none.

Code that needs a comment to be understood usually wants a clearer name,
a smaller function, or a different shape. Reach for those first.

### Don't

- Don't narrate what the code does. The code already says it.

  ```ts
  // Increment the counter
  counter += 1;

  // Return the result
  return result;

  // Loop over each save
  for (const save of saves) { … }
  ```

- Don't explain the change you are making. That belongs in the commit
  message or PR description, not the file.

  ```ts
  // Switched to a Map for O(1) lookups (was O(n) with the array)
  const byId = new Map(saves.map((s) => [s.id, s]));
  ```

- Don't leave TODOs without an owner and a date. If it's worth keeping,
  open a Linear issue and link it.

- Don't write JSDoc on presentational primitives (`Settings.Item`,
  `Card.Root`). The component name and the props interface say it all.

- Don't write essay-length comments. Two lines that name the problem
  and the lever almost always beat a fourteen-line history lesson. If
  the explanation truly needs paragraphs, write an ADR, a commit
  message, or a short file-top prose block — not a wall wedged
  between two lines of config.

  Bad:

  ```ts
  // `@pond/ui` is workspace-resolved, which means Vite's dep
  // optimizer pre-bundles it once at boot from
  // `node_modules/@pond/ui/src/index.ts` and serves the bundle
  // from `.vite/deps/`. Source edits inside `packages/ui/` then
  // sit outside the live module graph — HMR has nothing to
  // invalidate and you have to restart the dev server to see
  // changes. Aliasing the bare specifier to the source folder
  // pulls the package back into the graph so Fast Refresh and
  // CSS-modules HMR both work as if the code were app-local.
  // (… five more lines …)
  "@pond/ui": resolve(__dirname, "../../packages/ui/src"),
  ```

  Good:

  ```ts
  // Pull into the live module graph so HMR works on workspace
  // edits — Vite's dep optimizer otherwise freezes the package
  // at dev-server boot.
  "@pond/ui": resolve(__dirname, "../../packages/ui/src"),
  ```

### Do

- Do explain **why** when the why is non-obvious: a workaround for an
  upstream bug, a perf trade-off, a constraint from the OS, an invariant
  the type system can't express.

  ```ts
  // ESC clears the selection. Only listen while a save is selected so
  // we don't fight with dialogs / menus that have their own ESC
  // handling.
  useEffect(() => { … }, [id, close]);
  ```

- Do flag a known sharp edge a future reader could trip on.

  ```ts
  // `navigator.platform` is stable for the lifetime of the renderer
  // process, so resolve once at module load.
  const REVEAL_LABEL = (() => { … })();
  ```

- Do anchor cross-file relationships when the link isn't visible from
  the current file.

  ```ts
  // Mirrors the toast categories in `useToast()` —
  // `apps/desktop/src/renderer/src/ui/toast.tsx`.
  ```

### Rule of thumb

Before writing a comment, ask: **does this comment carry information the
code itself cannot?** If the answer is no, delete it and move on. If the
answer is yes, keep the comment short and put it directly above the line
or block it explains.

Prose blocks at the top of a file are fine when they document the
component's place in the system — see
`apps/desktop/src/renderer/src/components/preview-pane/index.tsx` for the
shape. They are not required.

## CSS class names

All class names in `*.css` and `*.module.css` are kebab-case. No
exceptions — no camelCase, no BEM `__` / `--` separators, no
PascalCase. Use plain `-` for word breaks and a second `-` to namespace
modifiers.

### Class names — Don't

```css
.gridWaterfall { ... }
.itemSelected { ... }
.pane__title { ... }
.pondCard--dimmed { ... }
```

### Class names — Do

```css
.grid-waterfall { ... }
.item-selected { ... }
.pane-title { ... }
.card-dimmed { ... }
```

CSS-module consumers index with bracket access:

```tsx
import styles from "./styles.module.css";

<div className={styles["grid-waterfall"]} />
```

If a class would only ever be reached via bracket access, prefer a
shorter name (`.grid` + `data-layout="waterfall"`) over a longer one
(`.grid-layout-waterfall`).

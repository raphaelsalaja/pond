/*
  Prototype switcher. Copy this file into the app beside the prototype route, load it once and write the variants only.

  <prototype-switcher>
    <section data-variant="Inline Filters" data-note="Wins with under 6 filters. Costs a row above the grid.">...</section>
    <section data-variant="Sidebar List" data-note="Wins with many filter groups. Costs 240px of width.">...</section>
  </prototype-switcher>

  Each direct child with `data-variant` is one variant. The label is two or three words of Title Case that say how it differs. `data-note` says when the variant wins and what it costs, shown under its name in the palette. Hidden variants stay mounted, so their state survives switching.

  Plain HTML, Svelte and Astro: load it with <script src="switcher.js"></script>, or import "./switcher.js" from a module.

  React: import it once in the route file, which is a "use client" file in Next.js. It does nothing on the server, so the import is safe there.

    "use client";
    import "./switcher.js";

    export default function FiltersPrototype() {
      return (
        <prototype-switcher>
          <section data-variant="Inline Filters" data-note="Wins with under 6 filters. Costs a row above the grid.">
            <InlineFilters />
          </section>
        </prototype-switcher>
      );
    }

  TypeScript: add prototype-switcher.d.ts beside it so JSX accepts the tag.

    import type { DetailedHTMLProps, HTMLAttributes } from "react";

    declare module "react" {
      namespace JSX {
        interface IntrinsicElements {
          "prototype-switcher": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
        }
      }
    }

  Vue: set compilerOptions.isCustomElement = (tag) => tag === "prototype-switcher" in the Vue plugin options.

  With server rendering, add `prototype-switcher:not(:defined) { visibility: hidden }` so the variants do not flash stacked before the script runs.

  The bar renders in a shadow root and inherits only `color-scheme` from the app, so it matches whatever theme the app sets on its root. It sits at the bottom centre showing the current variant's name and position, such as "Inline Filters 1/3", or at the top centre with `<prototype-switcher data-position="top">` when a variant uses the bottom edge. The current variant lives in `?variant=inline-filters`.

  The name, or ⌘K and Ctrl+K anywhere, opens a palette listing every variant with its note. Typing filters by name and note, and Enter shows the highlighted variant. A variant that handles ⌘K itself and calls preventDefault keeps the shortcut, and the name still opens the palette.

  Keep and Drop mark the current variant, and the palette shows each mark. Marks live in `?keep=` and `?drop=`, so they survive a reload. Note opens a field for the reviewer's own note on the current variant, kept in sessionStorage for the tab.

  Copy Prompt copies a review built from the marks and notes, and its tooltip says Copied or Copy Blocked. With no marks, the current variant counts as kept:

    Prototype review: /prototypes/filters

    Keep:
    - Inline Filters
      Note: Make the counts bigger
    - Sidebar List

    Drop:
    - Filter Sheet

    Next: Build one new variant that combines the kept ones, then delete the dropped ones. Follow each note.

  Keys: ← and → step, 1–9 jump, N opens the note, D drops, K keeps, P copies the prompt and R replays. Keys are ignored while focus is in a field. N, D, K, P and R work only while focus is in the bar or a variant, and a click on a variant puts it there.

  R takes the current variant out of the page and puts it back, so CSS animations and `@starting-style` entrances run again. It then fires `prototype-replay` on the variant. A component that animates on mount from script remounts by changing its `key` on that event:

    function Replayable({ children }) {
      const ref = useRef(null);
      const [run, setRun] = useState(0);
      useEffect(() => {
        const section = ref.current.closest("[data-variant]");
        const replay = () => setRun((n) => n + 1);
        section.addEventListener("prototype-replay", replay);
        return () => section.removeEventListener("prototype-replay", replay);
      }, []);
      return <div ref={ref} key={run}>{children}</div>;
    }
*/

"use strict";

if (typeof window !== "undefined" && !customElements.get("prototype-switcher")) {
  const css = `
    :host {
      display: block;
    }

    :host([hidden]),
    .variant[hidden] {
      display: none;
    }

    .variant {
      display: block;
    }

    .end {
      height: 80px;
    }

    :host([data-position="top"]) .variants {
      padding-top: 80px;
    }

    :host([data-position="top"]) .end {
      display: none;
    }

    .ui {
      all: initial;
      /* kit:tokens */
      --gray-1: light-dark(#ffffff, #080808);
      --gray-2: light-dark(#fafafa, #111111);
      --gray-3: light-dark(#f2f2f2, #1a1a1a);
      --gray-4: light-dark(#ebebeb, #222222);
      --gray-5: light-dark(#e3e3e3, #2a2a2a);
      --gray-10: light-dark(#6b6b6b, #8f8f8f);
      --gray-11: light-dark(#575757, #b4b4b4);
      --gray-12: light-dark(#080808, #ffffff);
      --blue: #02bbff;
      --red: light-dark(#d93036, #ff6369);
      --green: light-dark(#2b9a66, #3dd68c);
      --neutral-50: light-dark(rgb(0 0 0 / 0.03), rgb(255 255 255 / 0.03));
      --neutral-100: light-dark(rgb(0 0 0 / 0.07), rgb(255 255 255 / 0.07));
      --neutral-150: light-dark(rgb(0 0 0 / 0.11), rgb(255 255 255 / 0.11));
      --accent: light-dark(#2f3037, #ffffff);
      --danger: var(--red);
      --success: var(--green);
      --text-primary: light-dark(#212126, #ffffff);
      --text-secondary: light-dark(rgb(0 0 0 / 0.62), rgb(255 255 255 / 0.62));
      --text-tertiary: light-dark(rgb(33 33 38 / 0.65), rgb(255 255 255 / 0.65));
      --text-quaternary: light-dark(rgb(0 0 0 / 0.57), rgb(255 255 255 / 0.5));
      --text-on-accent: light-dark(#ffffff, #080808);
      --border-primary: var(--neutral-100);
      --border-secondary: var(--neutral-150);
      --background-primary: var(--gray-1);
      --background-secondary: var(--gray-2);
      --background-tertiary: var(--neutral-50);
      --background-hover: var(--neutral-100);
      --background-raised: light-dark(#ffffff, #212126);
      --background-control: light-dark(#ffffff, #222222);
      --background-overlay: var(--background-raised);
      --fill-hover: light-dark(rgb(8 8 8 / 4%), rgb(255 255 255 / 6%));
      --shadow-ring: 0 0 0 1px var(--neutral-100);
      --shadow-bar: var(--shadow-ring), 0 2px 4px -1px rgb(0 0 0 / 0.06), 0 6px 16px -4px rgb(0 0 0 / 0.08);
      --shadow-border: 0 0 0 1px light-dark(rgb(0 0 0 / 7%), rgb(255 255 255 / 7%));
      --shadow-default:
        inset 0 0 0 0.5px light-dark(transparent, rgb(255 255 255 / 7%)),
        0 0 0 0.5px light-dark(rgb(0 0 0 / 6%), transparent),
        0 1px 1px -1px light-dark(rgb(0 0 0 / 10%), transparent),
        0 1px 2px 0 light-dark(rgb(0 0 0 / 5%), transparent);
      --shadow-large: var(--shadow-ring), 0 5px 15px 0 rgb(0 0 0 / 0.08), 0 15px 35px -5px rgb(0 0 0 / 0.2);
      --shadow-extra-large: var(--shadow-large);
      --font-sans: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
      --font-weight-400: "wght" 400, "opsz" 14;
      --font-weight-500: "wght" 500, "opsz" 14;
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
      --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
      --duration-snappy: 220ms;
      --duration-exit: 160ms;
      --radius-control: 6px;
      --radius-menu: 12px;
      --radius-panel: 12px;
      --radius-kbd: 4px;
      /* kit:tokens end */
      --font-sans: ui-sans-serif, system-ui, sans-serif;
      color-scheme: inherit;
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 18px;
      font-variation-settings: var(--font-weight-400);
      font-optical-sizing: none;
      font-feature-settings: "calt", "ccmp", "locl", "kern", "cv01", "ss03";
      -webkit-font-smoothing: antialiased;
      color: var(--text-primary);
    }

    .ui,
    .ui *,
    .ui *::before,
    .ui *::after {
      box-sizing: border-box;
    }

    :where(.ui) * {
      padding: 0;
      margin: 0;
      font: inherit;
      font-variation-settings: inherit;
      color: inherit;
      border: 0;
    }

    :where(.ui) svg {
      display: block;
    }

    :where(.ui) button {
      cursor: pointer;
      user-select: none;
      background: none;
    }

    .ui :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .note {
      color: var(--text-tertiary);
    }

    /* kit:fade */
    @property --fade-start {
      syntax: "<length>";
      inherits: false;
      initial-value: 0px;
    }

    @property --fade-end {
      syntax: "<length>";
      inherits: false;
      initial-value: 0px;
    }

    @keyframes scroll-fade {
      0% {
        --fade-start: 0px;
        --fade-end: 24px;
      }
      10% {
        --fade-start: 24px;
      }
      90% {
        --fade-end: 24px;
      }
      100% {
        --fade-start: 24px;
        --fade-end: 0px;
      }
    }

    .scroll-fade {
      mask-image:
        linear-gradient(
          to bottom,
          transparent,
          rgb(0 0 0 / 0.36) calc(var(--fade-start) * 5 / 24),
          rgb(0 0 0 / 0.64) calc(var(--fade-start) * 10 / 24),
          rgb(0 0 0 / 0.84) calc(var(--fade-start) * 14 / 24),
          rgb(0 0 0 / 0.96) calc(var(--fade-start) * 19 / 24),
          black var(--fade-start),
          black calc(100% - var(--fade-end)),
          rgb(0 0 0 / 0.96) calc(100% - var(--fade-end) * 19 / 24),
          rgb(0 0 0 / 0.84) calc(100% - var(--fade-end) * 14 / 24),
          rgb(0 0 0 / 0.64) calc(100% - var(--fade-end) * 10 / 24),
          rgb(0 0 0 / 0.36) calc(100% - var(--fade-end) * 5 / 24),
          transparent
        ),
        linear-gradient(black, black),
        linear-gradient(black, black);
      mask-clip: border-box, border-box, no-clip;
      mask-size: 100% 100%, 100% 100%, calc(100% + 128px) calc(100% + 128px);
      mask-position: 0 0, 0 0, -64px -64px;
      mask-repeat: no-repeat;
      mask-composite: add, exclude;
      animation: scroll-fade linear both;
      animation-timeline: scroll(self);
    }
    /* kit:fade end */

    /* kit:controls */
    .chip,
    .action {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      height: 28px;
      padding: 0 12px;
      font-size: 13px;
      font-variation-settings: var(--font-weight-500);
      color: var(--text-tertiary);
      white-space: nowrap;
      border-radius: var(--radius-control);

      &[aria-pressed="true"] {
        color: var(--text-primary);
        background: var(--background-tertiary);
      }

      &:active:not(:disabled) {
        color: var(--text-primary);
      }

      &:disabled {
        cursor: default;
        opacity: 0.5;
      }
    }

    .action {
      color: var(--text-primary);
      background: var(--background-tertiary);

      &:active:not(:disabled) {
        background: var(--background-hover);
      }
    }

    .icon-button,
    .tool-button {
      position: relative;
      display: grid;
      flex: none;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--text-tertiary);
      border-radius: var(--radius-control);

      &::before {
        position: absolute;
        inset: -4px;
        content: "";
      }

      &:disabled {
        cursor: default;
        opacity: 0.4;
      }
    }

    .icon-button {
      background: var(--background-tertiary);

      &:active:not(:disabled, [aria-pressed="true"]) {
        color: var(--text-primary);
        background: var(--background-hover);
      }

      &[aria-pressed="true"] {
        color: var(--text-on-accent);
        background: var(--accent);
      }
    }

    .tool-button {
      &:active:not(:disabled) {
        color: var(--text-primary);
        background: var(--background-tertiary);
      }

      &[aria-pressed="true"] {
        color: var(--text-primary);
        background: var(--background-tertiary);
      }

      &[aria-pressed="true"]:active:not(:disabled) {
        background: var(--background-hover);
      }
    }

    .pick {
      position: relative;
      display: grid;
      flex: none;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--text-quaternary);
      border-radius: var(--radius-control);
      box-shadow: inset 0 0 0 1px var(--border-secondary);

      &::before {
        position: absolute;
        inset: -6px;
        content: "";
      }

      &:active:not([aria-pressed="true"]) {
        color: var(--text-primary);
      }

      &[aria-pressed="true"] {
        color: var(--text-on-accent);
        background: var(--accent);
        box-shadow: none;
      }
    }

    .count {
      color: var(--text-quaternary);
      font-variant-numeric: tabular-nums;
    }

    @media (hover: hover) and (pointer: fine) {
      .chip:hover:not(:disabled) {
        color: var(--text-primary);
      }

      .action:hover:not(:disabled) {
        background: var(--background-hover);
      }

      .icon-button:hover:not(:disabled, [aria-pressed="true"]) {
        color: var(--text-primary);
        background: var(--background-hover);
      }

      .tool-button:hover:not(:disabled) {
        color: var(--text-primary);
        background: var(--background-tertiary);
      }

      .tool-button[aria-pressed="true"]:hover:not(:disabled) {
        background: var(--background-hover);
      }

      .pick:hover:not([aria-pressed="true"]) {
        color: var(--text-primary);
      }
    }
    /* kit:controls end */

    /* kit:overlays */
    .toast {
      position: fixed;
      inset: auto;
      display: inline-flex;
      align-items: center;
      height: 32px;
      padding: 0 12px;
      margin: 0;
      overflow: visible;
      font-size: 13px;
      font-variation-settings: var(--font-weight-500);
      color: var(--text-primary);
      white-space: nowrap;
      pointer-events: none;
      background: var(--background-raised);
      border: 1px solid transparent;
      border-radius: 10px;
      box-shadow: var(--shadow-large);
      opacity: 0;
      translate: -50% 4px;
      scale: 0.97;
      transform-origin: bottom center;
      transition:
        opacity var(--duration-exit) var(--ease-out),
        translate var(--duration-exit) var(--ease-out),
        scale var(--duration-exit) var(--ease-out);

      &[data-side="below"] {
        translate: -50% -4px;
        transform-origin: top center;
      }

      &[data-open] {
        opacity: 1;
        translate: -50% 0;
        scale: 1;
        transition-duration: var(--duration-snappy);
      }

      &:has(button) {
        gap: 12px;
        padding-right: 4px;
        pointer-events: auto;
      }

      button {
        height: 24px;
        padding: 0 8px;
        color: var(--accent);
        border-radius: 6px;

        &:active {
          background: var(--background-hover);
        }
      }
    }

    .tip {
      position: fixed;
      inset: auto;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      height: 24px;
      padding: 0 8px;
      margin: 0;
      overflow: visible;
      font-size: 12px;
      font-variation-settings: var(--font-weight-500);
      color: var(--text-primary);
      white-space: nowrap;
      pointer-events: none;
      background: var(--background-raised);
      border: 1px solid transparent;
      border-radius: var(--radius-control);
      box-shadow: var(--shadow-large);
      translate: -50% 0;
      transition:
        opacity 125ms var(--ease-out),
        translate 125ms var(--ease-out);

      @starting-style {
        opacity: 0;
        translate: -50% 4px;
      }

      &[data-side="below"] {
        @starting-style {
          translate: -50% -4px;
        }
      }

      &[data-instant] {
        transition: none;
      }

      &:not(:popover-open) {
        display: none;
      }

      kbd {
        font: inherit;
        color: var(--text-tertiary);
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .toast button:hover {
        background: var(--background-hover);
      }
    }
    /* kit:overlays end */

    .bar {
      --spring: linear(0, 0.2414, 0.6338, 0.9173, 1.0476, 1.0726, 1.0514, 1.0231, 1.0041, 0.9959, 0.9948, 0.9966, 0.9986, 0.9998, 1);
      position: fixed;
      inset: auto 0 calc(16px + env(safe-area-inset-bottom));
      display: none;
      gap: 2px;
      align-items: center;
      width: max-content;
      max-width: calc(100vw - 32px);
      height: 40px;
      padding: 4px;
      margin: 0 auto;
      overflow: visible;
      background: var(--background-raised);
      border: 0;
      border-radius: 999px;
      box-shadow: var(--shadow-bar);
      opacity: 0;
      translate: 0 12px;
      scale: 0.9;
      transform-origin: bottom center;
      transition:
        opacity var(--duration-exit) var(--ease-out),
        translate var(--duration-exit) var(--ease-out),
        scale var(--duration-exit) var(--ease-out),
        display var(--duration-exit) allow-discrete,
        overlay var(--duration-exit) allow-discrete;

      &:popover-open {
        display: flex;
        opacity: 1;
        translate: 0;
        scale: 1;
        transition:
          opacity var(--duration-snappy) var(--ease-out),
          translate 450ms var(--spring),
          scale 450ms var(--spring);

        @starting-style {
          opacity: 0;
          translate: 0 12px;
          scale: 0.9;
        }
      }
    }

    :host([data-position="top"]) .bar {
      inset: calc(16px + env(safe-area-inset-top)) 0 auto;
      transform-origin: top center;
    }

    :host([data-position="top"]) .bar:not(:popover-open) {
      translate: 0 -12px;
    }

    @starting-style {
      :host([data-position="top"]) .bar:popover-open {
        translate: 0 -12px;
      }
    }

    .divider {
      flex: none;
      width: 1px;
      height: 16px;
      margin: 0 4px;
      background: var(--border-secondary);
    }

    .bar :is(.current, .tool-button) {
      border-radius: 999px;
      transition:
        background-color 150ms var(--ease-out),
        color 150ms var(--ease-out),
        scale 120ms var(--ease-out);

      &:focus-visible {
        outline-color: color-mix(in oklab, var(--accent) 60%, var(--background-raised));
        outline-offset: -2px;
      }
    }

    .tipped.find {
      flex: 0 1 auto;
      min-width: 0;
    }

    .current {
      min-width: 0;
      max-width: 280px;
      height: 32px;
      padding: 0 12px 0 10px;
      overflow: hidden;
      color: var(--text-primary);
      background: var(--background-raised);

      svg {
        flex: none;
        color: var(--text-quaternary);
      }

      .count {
        flex: none;
        color: var(--text-tertiary);
      }

      &:active:not(:disabled) {
        background: var(--neutral-50);
        scale: 0.97;
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .current:hover {
        background: var(--neutral-50);
      }
    }

    .current-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tool-button {
      width: 32px;
      height: 32px;
      color: var(--text-secondary);

      &:active {
        scale: 0.92;
      }
    }

    .keep {
      --mark: var(--success);
    }

    .drop {
      --mark: var(--danger);
    }

    .bar :is(.keep, .drop)[aria-pressed="true"] {
      color: var(--mark);
      background: color-mix(in oklab, var(--mark) 12%, transparent);
    }

    @media (hover: hover) and (pointer: fine) {
      .bar :is(.keep, .drop)[aria-pressed="true"]:hover {
        background: color-mix(in oklab, var(--mark) 18%, transparent);
      }
    }

    .tipped {
      position: relative;
      display: flex;
      flex: none;
    }

    .hint {
      position: absolute;
      bottom: calc(100% + 14px);
      left: 50%;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      height: 26px;
      padding: 0 4px 0 8px;
      white-space: nowrap;
      pointer-events: none;
      color: #ffffff;
      background: #000000;
      border-radius: var(--radius-control);
      box-shadow: 0 0 0 1px light-dark(transparent, rgb(255 255 255 / 0.12));
      opacity: 0;
      translate: -50% 4px;
      transition:
        opacity 125ms var(--ease-out),
        translate 125ms var(--ease-out);

      kbd {
        min-width: 18px;
        padding: 0 5px;
        font-size: 11px;
        line-height: 18px;
        font-variation-settings: var(--font-weight-500);
        color: rgb(255 255 255 / 0.73);
        text-align: center;
        background: rgb(255 255 255 / 0.15);
        border-radius: var(--radius-kbd);
      }
    }

    :host([data-position="top"]) .hint {
      top: calc(100% + 14px);
      bottom: auto;
      translate: -50% -4px;
    }

    @media (hover: hover) and (pointer: fine) {
      .tipped:hover .hint {
        opacity: 1;
        translate: -50% 0;
        transition-delay: 500ms;

        .bar[data-warm] & {
          transition-delay: 0s;
        }
      }
    }

    .tipped:has(:focus-visible) .hint {
      opacity: 1;
      translate: -50% 0;
      transition-delay: 0s;
    }

    .hint[data-show] {
      padding-inline: 8px;
      opacity: 1;
      translate: -50% 0;
      transition-delay: 0s;

      kbd {
        display: none;
      }
    }

    .bar[data-noting] .hint {
      opacity: 0 !important;
    }

    .bar[data-noting] .note-toggle {
      color: var(--text-primary);
      background: var(--neutral-50);
    }

    .note-toggle[data-filled]::after {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: 5px;
      height: 5px;
      content: "";
      background: currentColor;
      border-radius: 50%;
      box-shadow: 0 0 0 1.5px var(--background-raised);
    }

    .note-panel {
      position: fixed;
      inset: auto;
      gap: 4px;
      max-width: calc(100vw - 16px);
      padding: 12px 16px 14px;
      margin: 0;
      overflow: visible;
      color: var(--text-primary);
      background: var(--background-raised);
      border-radius: var(--radius-panel);
      box-shadow:
        var(--shadow-ring),
        0 1px 2px rgb(0 0 0 / 0.04),
        0 4px 10px -4px rgb(0 0 0 / 0.06);
      opacity: 0;
      translate: -50% 4px;
      scale: 0.97;
      transform-origin: bottom center;
      transition:
        opacity 120ms var(--ease-out),
        translate 120ms var(--ease-out),
        scale 120ms var(--ease-out),
        display 120ms allow-discrete,
        overlay 120ms allow-discrete;

      &[data-below] {
        translate: -50% -4px;
        transform-origin: top center;
      }

      &:popover-open {
        display: grid;
        opacity: 1;
        translate: -50% 0;
        scale: 1;
        transition-duration: 200ms;

        @starting-style {
          opacity: 0;
          translate: -50% 4px;
          scale: 0.97;
        }
      }

      &[data-below]:popover-open {
        @starting-style {
          translate: -50% -4px;
        }
      }

      &:not(:popover-open) {
        display: none;
      }
    }

    .note-label {
      font-size: 12px;
      line-height: 16px;
      color: var(--text-tertiary);
    }

    .note-field {
      width: 100%;
      min-height: 40px;
      max-height: 160px;
      line-height: 20px;
      resize: none;
      field-sizing: content;
      background: none;

      &::placeholder {
        color: var(--text-quaternary);
      }

      &:focus-visible {
        outline: none;
      }

      @media (forced-colors: active) {
        &:focus-visible {
          outline: 2px solid CanvasText;
          outline-offset: 4px;
        }
      }
    }

    .status {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .option-title {
      font-variation-settings: var(--font-weight-500);
    }

    .palette {
      width: min(544px, calc(100vw - 40px));
      max-width: none;
      max-height: none;
      padding: 0;
      margin: 64px auto auto;
      overflow: visible;
      background: none;
      border: 0;
      opacity: 0;
      translate: 0 -8px;
      scale: 0.98;
      transform-origin: top center;
      transition:
        opacity 150ms cubic-bezier(0.23, 1, 0.32, 1),
        translate 150ms cubic-bezier(0.23, 1, 0.32, 1),
        scale 150ms cubic-bezier(0.23, 1, 0.32, 1),
        display 150ms allow-discrete,
        overlay 150ms allow-discrete;

      &::backdrop {
        background: rgb(0 0 0 / 0);
        backdrop-filter: blur(0);
        transition:
          background-color 150ms cubic-bezier(0.23, 1, 0.32, 1),
          backdrop-filter 150ms cubic-bezier(0.23, 1, 0.32, 1),
          display 150ms allow-discrete,
          overlay 150ms allow-discrete;
      }

      &[open] {
        opacity: 1;
        translate: 0;
        scale: 1;
        transition-duration: 220ms;

        @starting-style {
          opacity: 0;
          translate: 0 -8px;
          scale: 0.98;
        }
      }

      &[open]::backdrop {
        background: rgb(0 0 0 / 0.32);
        backdrop-filter: blur(4px);
        transition-duration: 220ms;
      }
    }

    @starting-style {
      .palette[open]::backdrop {
        background: rgb(0 0 0 / 0);
        backdrop-filter: blur(0);
      }
    }

    .palette-body {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--background-overlay);
      border-radius: var(--radius-panel);
      box-shadow: var(--shadow-extra-large);
    }

    .query-row {
      display: flex;
      flex: none;
      gap: 10px;
      align-items: center;
      height: 48px;
      padding: 0 16px;
      color: var(--text-quaternary);
      border-bottom: 1px solid var(--border-primary);
    }

    .query {
      flex: 1;
      min-width: 0;
      height: 100%;
      color: var(--text-primary);
      background: none;

      &:focus-visible {
        outline: none;
      }

      &::placeholder {
        color: var(--text-tertiary);
      }
    }

    .options {
      display: grid;
      gap: 2px;
      max-height: min(360px, 50vh);
      padding: 4px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: none;
      list-style: none;
    }

    .option {
      display: grid;
      gap: 2px;
      min-height: 36px;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: var(--radius-control);
      transition: background-color 100ms var(--ease-out);

      &[aria-selected="true"] {
        background: var(--neutral-50);
      }
    }

    .option-title {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .showing {
      padding: 0 6px;
      font-size: 11px;
      line-height: 16px;
      color: var(--text-secondary);
      border-radius: var(--radius-kbd);
      box-shadow: var(--shadow-ring), 0 2px 0 -1px rgb(0 0 0 / 0.04);
    }

    .mark {
      display: inline-flex;
      gap: 5px;
      align-items: center;
      font-size: 11px;
      line-height: 16px;
      color: var(--text-secondary);

      &::before {
        width: 6px;
        height: 6px;
        content: "";
        background: var(--mark);
        border-radius: 50%;
      }
    }

    .no-match {
      padding: 24px 16px;
      color: var(--text-tertiary);
      text-align: center;
    }

    @media (prefers-reduced-motion: reduce) {
      .ui,
      .ui *,
      .ui *::before,
      .ui *::after,
      .palette,
      .palette::backdrop {
        transition-duration: 0s !important;
      }
    }
  `;

  const icon = (paths) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const icons = {
    send: `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6875" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.75 10.022v4.246c0 .409.464.645.794.404l.74-.539" /><path d="M15.58 2.569L5.75 10.022" /><path d="M2.883 6.935l12.299-4.393c.363-.13.73.183.66.562l-2.196 11.86c-.067.363-.492.531-.789.311L2.754 7.807c-.322-.238-.248-.738.129-.873z" /></svg>`,
    search: icon('<circle cx="7" cy="7" r="4.25" /><path d="M10.25 10.25l3 3" />'),
    keep: icon('<path d="M3.25 8.5l3 3 6.5-7" />'),
    drop: icon('<path d="M4.5 4.5l7 7" /><path d="M11.5 4.5l-7 7" />'),
    note: icon('<path d="M3.5 12.5l.5-2.5 6.94-6.94a1.5 1.5 0 0 1 2.12 2.12L6 12z" /><path d="M9.5 4.5l2 2" />'),
  };
  const marks = { keep: "Kept", drop: "Dropped" };

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? "⌘" : "Ctrl+";

  const tool = (name, svg, label, key) =>
    `<button class="tool-button ${name}" type="button" aria-label="${label}" aria-keyshortcuts="${key}">${svg}</button><span class="hint" aria-hidden="true">${label}<kbd>${key}</kbd></span>`;

  const template = `
    <style>${css}</style>
    <div class="variants" tabindex="-1"></div>
    <div class="end"></div>
    <nav class="ui bar" popover="manual" aria-label="Variants">
      <span class="tipped find">
        <button class="action current" type="button" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K">${icons.search}<span class="current-label"></span><span class="count"></span></button>
        <span class="hint" aria-hidden="true">Find<kbd>${mod}K</kbd></span>
      </span>
      <span class="divider" aria-hidden="true"></span>
      <span class="tipped">${tool("note-toggle", icons.note, "Note", "N").replace("<button", '<button popovertarget="note-panel"')}</span>
      <span class="tipped">${tool("drop", icons.drop, "Drop", "D")}</span>
      <span class="tipped">${tool("keep", icons.keep, "Keep", "K")}</span>
      <span class="divider" aria-hidden="true"></span>
      <span class="tipped">${tool("copy-prompt", icons.send, "Copy Prompt", "P")}</span>
      <span class="status" role="status"></span>
    </nav>
    <div class="ui note-panel" id="note-panel" popover="auto">
      <label class="note-label" for="note-field">Note on <span class="note-variant"></span></label>
      <textarea class="note-field" id="note-field" rows="2" placeholder="Make the counts bigger" spellcheck="true"></textarea>
    </div>
    <dialog class="palette" aria-label="Find a Variant" closedby="any">
      <div class="ui palette-body">
        <label class="query-row">${icons.search}<input class="query" type="text" role="combobox" aria-expanded="true" aria-controls="options" aria-autocomplete="list" aria-label="Find a variant" placeholder="Find a variant" autocomplete="off" spellcheck="false" /></label>
        <ul class="options scroll-fade" id="options" role="listbox" aria-label="Variants"></ul>
      </div>
    </dialog>
  `;

  const typing =
    "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='listbox'], [role='menu'], [role='radiogroup'], [role='slider'], [role='spinbutton'], [role='tablist']";
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  const easeOut = "cubic-bezier(0.23, 1, 0.32, 1)";

  function h(tag, className, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...children);
    return node;
  }

  function slugify(label) {
    return (
      label
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "variant"
    );
  }

  class PrototypeSwitcher extends HTMLElement {
    #root = this.attachShadow({ mode: "open", slotAssignment: "manual" });
    #items = [];
    #index = 0;
    #wanted = null;
    #flight = null;
    #list;
    #bar;
    #current;
    #currentLabel;
    #count;
    #keepButton;
    #dropButton;
    #copyButton;
    #noteButton;
    #notePanel;
    #noteVariant;
    #noteField;
    #marks = new Map();
    #notes = new Map();
    #status;
    #copiedTimer = 0;
    #palette;
    #search;
    #options;
    #results = [];
    #active = 0;
    #warmTimer = 0;
    #observer = new MutationObserver((records) => {
      const changed = records.some((record) =>
        record.type === "childList" ? record.target === this : record.target.parentElement === this,
      );
      if (changed) this.#sync();
    });

    constructor() {
      super();
      this.#root.innerHTML = template;
      this.#list = this.#root.querySelector(".variants");
      this.#bar = this.#root.querySelector(".bar");
      this.#current = this.#root.querySelector(".current");
      this.#currentLabel = this.#root.querySelector(".current-label");
      this.#count = this.#root.querySelector(".count");
      this.#keepButton = this.#root.querySelector(".keep");
      this.#dropButton = this.#root.querySelector(".drop");
      this.#copyButton = this.#root.querySelector(".copy-prompt");
      this.#noteButton = this.#root.querySelector(".note-toggle");
      this.#notePanel = this.#root.querySelector(".note-panel");
      this.#noteVariant = this.#root.querySelector(".note-variant");
      this.#noteField = this.#root.querySelector(".note-field");
      this.#status = this.#root.querySelector(".status");
      this.#palette = this.#root.querySelector(".palette");
      this.#search = this.#root.querySelector(".query");
      this.#options = this.#root.querySelector(".options");

      this.#current.addEventListener("click", () => this.#openPalette());
      this.#palette.addEventListener("click", (event) => {
        if (event.target === this.#palette) this.#palette.close();
      });
      this.#search.addEventListener("input", () => {
        this.#active = 0;
        this.#renderOptions();
      });
      this.#search.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          this.#highlight(this.#active + (event.key === "ArrowDown" ? 1 : -1));
        } else if (event.key === "Enter") {
          event.preventDefault();
          this.#choose(this.#active);
        }
      });
      this.#options.addEventListener("pointermove", (event) => {
        const option = event.target.closest(".option");
        if (option) this.#highlight(Number(option.dataset.result));
      });
      this.#options.addEventListener("click", (event) => {
        const option = event.target.closest(".option");
        if (option) this.#choose(Number(option.dataset.result));
      });

      this.#keepButton.addEventListener("click", () => this.#mark("keep"));
      this.#dropButton.addEventListener("click", () => this.#mark("drop"));
      this.#copyButton.addEventListener("click", () => this.#copyPrompt());
      this.#noteField.addEventListener("input", () => this.#writeNote());
      this.#notePanel.addEventListener("beforetoggle", (event) => {
        const open = event.newState === "open";
        this.#bar.toggleAttribute("data-noting", open);
        if (!open) return;
        this.#fillNote();
        this.#placeNote();
      });
      this.#notePanel.addEventListener("toggle", (event) => {
        if (event.newState === "open") this.#noteField.focus();
      });

      for (const tipped of this.#root.querySelectorAll(".tipped")) {
        tipped.addEventListener("pointerenter", () => {
          clearTimeout(this.#warmTimer);
          this.#warmTimer = setTimeout(() => this.#bar.toggleAttribute("data-warm", true), 500);
        });
      }
      this.#bar.addEventListener("pointerleave", () => {
        clearTimeout(this.#warmTimer);
        this.#bar.removeAttribute("data-warm");
      });
      this.addEventListener(
        "pointerdown",
        () => {
          if (!this.contains(document.activeElement)) this.#list.focus({ preventScroll: true });
        },
        { capture: true },
      );
    }

    connectedCallback() {
      this.#readURL();
      this.#readNotes();
      this.#observer.observe(this, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-variant", "data-note"],
      });
      document.addEventListener("keydown", this.#onKey);
      addEventListener("popstate", this.#onPopState);
      this.#sync();
    }

    disconnectedCallback() {
      this.#observer.disconnect();
      clearTimeout(this.#warmTimer);
      document.removeEventListener("keydown", this.#onKey);
      removeEventListener("popstate", this.#onPopState);
    }

    #readURL() {
      const params = new URLSearchParams(location.search);
      this.#wanted = params.get("variant");
      this.#marks = new Map();
      for (const mark of Object.keys(marks)) {
        for (const slug of params.get(mark)?.split(",") ?? []) if (slug) this.#marks.set(slug, mark);
      }
    }

    #writeURL() {
      const url = new URL(location.href);
      url.searchParams.set("variant", this.#items[this.#index].slug);
      for (const mark of Object.keys(marks)) {
        const slugs = this.#marked(mark).map((item) => item.slug);
        if (slugs.length) url.searchParams.set(mark, slugs.join(","));
        else url.searchParams.delete(mark);
      }
      history.replaceState(history.state, "", url);
    }

    #marked(mark) {
      return this.#items.filter((item) => this.#marks.get(item.slug) === mark);
    }

    #sync() {
      const elements = [...this.children].filter((element) => element.hasAttribute("data-variant"));
      const previous = new Map(this.#items.map((item) => [item.element, item]));
      const current = this.#items[this.#index]?.element;
      const slugs = new Set();

      this.#items = elements.map((element, index) => {
        const item = previous.get(element) ?? this.#createItem(element);
        previous.delete(element);
        item.label = element.dataset.variant.trim() || "Untitled";
        item.note = element.dataset.note?.trim() ?? "";
        let slug = slugify(item.label);
        for (let n = 2; slugs.has(slug); n++) slug = `${slugify(item.label)}-${n}`;
        slugs.add(slug);
        item.slug = slug;
        return item;
      });
      for (const item of previous.values()) item.wrapper.remove();

      const wrappers = this.#items.map((item) => item.wrapper);
      if (wrappers.some((wrapper, index) => this.#list.children[index] !== wrapper)) this.#list.append(...wrappers);
      for (const item of this.#items) item.slot.assign(item.element);

      const wanted = this.#match(this.#wanted);
      if (wanted >= 0) {
        this.#index = wanted;
        this.#wanted = null;
      } else {
        const kept = this.#items.findIndex((item) => item.element === current);
        this.#index = kept >= 0 ? kept : Math.min(this.#index, Math.max(this.#items.length - 1, 0));
      }

      const open = this.#bar.matches(":popover-open");
      if (this.#items.length && this.isConnected && !open) this.#bar.showPopover();
      else if (!this.#items.length && open) this.#bar.hidePopover();
      this.#render();
    }

    #createItem(element) {
      const slot = document.createElement("slot");
      const wrapper = h("div", "variant", slot);
      return { element, slot, wrapper };
    }

    #match(value) {
      if (value == null) return -1;
      const wanted = value.trim().toLowerCase();
      const number = Number(wanted);
      if (Number.isInteger(number) && number >= 1 && number <= this.#items.length) return number - 1;
      return this.#items.findIndex((item) => item.slug === wanted || item.label.toLowerCase() === wanted);
    }

    #render() {
      this.#items.forEach((item, index) => {
        item.wrapper.hidden = index !== this.#index;
      });
      const item = this.#items[this.#index];
      const total = this.#items.length;
      this.#currentLabel.textContent = item?.label ?? "";
      this.#count.textContent = `${this.#index + 1}/${total}`;
      const mark = item && this.#marks.get(item.slug);
      const state = mark ? `, ${marks[mark].toLowerCase()}` : "";
      this.#current.setAttribute("aria-label", `${item?.label ?? ""}${state}, ${this.#index + 1} of ${total}`);
      this.#keepButton.setAttribute("aria-pressed", String(mark === "keep"));
      this.#dropButton.setAttribute("aria-pressed", String(mark === "drop"));
      this.#noteButton.toggleAttribute("data-filled", Boolean(item && this.#noteOf(item)));
      if (this.#notePanel.matches(":popover-open")) {
        this.#fillNote();
        this.#placeNote();
      }
    }

    #step(delta) {
      const total = this.#items.length;
      if (total) this.#show((this.#index + delta + total) % total);
    }

    #show(index) {
      if (index < 0 || index >= this.#items.length || index === this.#index) return;
      const direction = Math.sign(index - this.#index);
      const focused = document.activeElement;
      const from = this.#current.offsetWidth;
      this.#index = index;
      this.#render();
      this.#keepFocus(focused);
      this.#writeURL();
      const { wrapper } = this.#items[index];
      if (!motion.matches) return;
      this.#flight?.cancel();
      this.#flight = wrapper.animate(
        [
          { opacity: 0, translate: `${direction * 8}px 0` },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 280, easing: easeOut },
      );
      const to = this.#current.offsetWidth;
      if (from !== to) this.#current.animate({ width: [`${from}px`, `${to}px`] }, { duration: 220, easing: easeOut });
      for (const part of [this.#currentLabel, this.#count]) {
        part.animate(
          [
            { opacity: 0, translate: `${direction * 6}px 0`, filter: "blur(2px)" },
            { opacity: 1, translate: "0 0", filter: "blur(0)" },
          ],
          { duration: 220, easing: easeOut },
        );
      }
    }

    #animateIcon(button, keyframes, duration) {
      if (motion.matches) button.querySelector("svg").animate(keyframes, { duration, easing: easeOut });
    }

    get #notesKey() {
      return `prototype-switcher:notes:${location.pathname}`;
    }

    #readNotes() {
      try {
        this.#notes = new Map(Object.entries(JSON.parse(sessionStorage.getItem(this.#notesKey)) ?? {}));
      } catch {
        this.#notes = new Map();
      }
    }

    #writeNote() {
      const item = this.#items[this.#index];
      if (!item) return;
      const text = this.#noteField.value.trim();
      if (text) this.#notes.set(item.slug, this.#noteField.value);
      else this.#notes.delete(item.slug);
      this.#noteButton.toggleAttribute("data-filled", Boolean(text));
      try {
        sessionStorage.setItem(this.#notesKey, JSON.stringify(Object.fromEntries(this.#notes)));
      } catch {}
    }

    #noteOf(item) {
      return this.#notes.get(item.slug)?.trim() ?? "";
    }

    #toggleNote() {
      this.#noteButton.click();
    }

    #fillNote() {
      const item = this.#items[this.#index];
      this.#noteVariant.textContent = item?.label ?? "";
      this.#noteField.value = (item && this.#notes.get(item.slug)) ?? "";
    }

    #placeNote() {
      const bar = this.#bar.getBoundingClientRect();
      const panel = this.#notePanel;
      const below = this.dataset.position === "top";
      panel.style.left = `${bar.left + bar.width / 2}px`;
      panel.style.width = `${Math.max(bar.width, 300)}px`;
      panel.style.top = below ? `${bar.bottom + 8}px` : "auto";
      panel.style.bottom = below ? "auto" : `${innerHeight - bar.top + 8}px`;
      panel.toggleAttribute("data-below", below);
    }

    #replay() {
      const item = this.#items[this.#index];
      if (!item) return;
      const { element, slot } = item;
      const next = element.nextSibling;
      const focused = document.activeElement;
      element.remove();
      this.insertBefore(element, next);
      slot.assign(element);
      this.#keepFocus(focused);
      element.dispatchEvent(new Event("prototype-replay"));
    }

    #keepFocus(focused) {
      if (focused === this || !this.contains(focused)) return;
      if (document.activeElement === focused && focused.checkVisibility()) return;
      this.#list.focus({ preventScroll: true });
    }

    #mark(mark) {
      const item = this.#items[this.#index];
      if (!item) return;
      const on = this.#marks.get(item.slug) !== mark;
      if (on) this.#marks.set(item.slug, mark);
      else this.#marks.delete(item.slug);
      this.#render();
      this.#writeURL();
      if (on) this.#animateIcon(mark === "keep" ? this.#keepButton : this.#dropButton, { scale: [0.6, 1] }, 240);
    }

    #prompt() {
      const kept = this.#marked("keep");
      const dropped = this.#marked("drop");
      if (!kept.length && !dropped.length) kept.push(this.#items[this.#index]);
      const unmarked = this.#items.filter((item) => !kept.includes(item) && !dropped.includes(item));
      const sections = [`Prototype review: ${location.pathname}`];
      for (const [title, items] of [
        ["Keep", kept],
        ["Drop", dropped],
        ["Unmarked", unmarked],
      ]) {
        if (items.length) sections.push(`${title}:\n${items.map((item) => this.#line(item)).join("\n")}`);
      }
      let next = "Delete the dropped variants and keep the rest on the page for another look.";
      if (kept.length === 1) next = `Move ${kept[0].label} into the product, then delete the other variants.`;
      else if (kept.length > 1) next = "Build one new variant that combines the kept ones, then delete the dropped ones.";
      else if (!unmarked.length) next = "Every variant was dropped. Delete them and start a new round.";
      if (this.#items.some((item) => this.#noteOf(item))) next += " Follow each note.";
      sections.push(`Next: ${next}`);
      return sections.join("\n\n");
    }

    #line(item) {
      const note = this.#noteOf(item);
      if (!note) return `- ${item.label}`;
      return `- ${item.label}\n  Note: ${note.split("\n").join("\n  ")}`;
    }

    async #copyPrompt() {
      if (!this.#items.length) return;
      const text = this.#prompt();
      const copied = await Promise.resolve()
        .then(() => navigator.clipboard.writeText(text))
        .then(
          () => true,
          () => false,
        );
      const hint = this.#copyButton.nextElementSibling;
      hint.firstChild.textContent = copied ? "Copied" : "Copy Blocked";
      hint.toggleAttribute("data-show", true);
      this.#status.textContent = copied ? "Copied the review." : "Copy was blocked.";
      clearTimeout(this.#copiedTimer);
      this.#copiedTimer = setTimeout(() => {
        hint.removeAttribute("data-show");
        hint.firstChild.textContent = "Copy Prompt";
      }, 1500);
      if (copied) {
        this.#animateIcon(
          this.#copyButton,
          [
            { translate: "0 0", opacity: 1 },
            { translate: "4px -4px", opacity: 0, offset: 0.45 },
            { translate: "-4px 4px", opacity: 0, offset: 0.55 },
            { translate: "0 0", opacity: 1 },
          ],
          360,
        );
      }
    }

    #openPalette() {
      if (!this.#items.length) return;
      this.#search.value = "";
      if (!this.#palette.open) this.#palette.showModal();
      this.#renderOptions();
      this.#highlight(this.#index);
      this.#search.focus();
    }

    #renderOptions() {
      const query = this.#search.value.trim().toLowerCase();
      this.#results = this.#items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => !query || `${item.label} ${item.note}`.toLowerCase().includes(query));
      const options = this.#results.map(({ item, index }, result) => {
        const title = h("span", "option-title", item.label);
        if (index === this.#index) title.append(h("span", "showing", "Showing"));
        const mark = this.#marks.get(item.slug);
        if (mark) title.append(h("span", `mark ${mark}`, marks[mark]));
        const option = h("li", "option", title);
        if (item.note) option.append(h("span", "note", item.note));
        option.id = `option-${result}`;
        option.setAttribute("role", "option");
        option.dataset.result = String(result);
        return option;
      });
      this.#options.replaceChildren(...(options.length ? options : [h("li", "no-match", "No variant matches")]));
      this.#highlight(this.#active);
    }

    #highlight(result) {
      const options = this.#options.querySelectorAll(".option");
      if (!options.length) {
        this.#search.removeAttribute("aria-activedescendant");
        return;
      }
      this.#active = Math.min(Math.max(result, 0), options.length - 1);
      options.forEach((option, i) => option.setAttribute("aria-selected", String(i === this.#active)));
      const active = options[this.#active];
      this.#search.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    }

    #choose(result) {
      const chosen = this.#results[result];
      if (!chosen) return;
      this.#palette.close();
      this.#show(chosen.index);
    }

    #onKey = (event) => {
      if (!this.#items.length || event.defaultPrevented || event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        this.#openPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.composedPath()[0];
      if (target instanceof Element && (target.closest(typing) || target.isContentEditable)) return;

      const key = event.key.toLowerCase();
      const inside = event.composedPath().includes(this);
      if (key === "arrowleft") this.#step(-1);
      else if (key === "arrowright") this.#step(1);
      else if (/^[1-9]$/.test(key) && Number(key) <= this.#items.length) this.#show(Number(key) - 1);
      else if (key === "k" && inside) this.#mark("keep");
      else if (key === "d" && inside) this.#mark("drop");
      else if (key === "n" && inside) this.#toggleNote();
      else if (key === "p" && inside) this.#copyPrompt();
      else if (key === "r" && inside) this.#replay();
      else return;
      event.preventDefault();
    };

    #onPopState = () => {
      this.#readURL();
      this.#sync();
    };
  }

  customElements.define("prototype-switcher", PrototypeSwitcher);
}

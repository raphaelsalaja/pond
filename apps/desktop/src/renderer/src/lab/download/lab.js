/* oxlint-disable */
/*
  Lab. Copy this file into the app and load it once on a development-only route. Then write entries only.

  <lab-page title="Components" root="/Users/me/app">
    <lab-tune property="--accent" label="Accent" min="0" max="360" value="234" format="oklch(0.746 0.156 {})"></lab-tune>
    <lab-tune property="--radius-pill" label="Pill Radius" min="0" max="16" value="16" format="{}px"></lab-tune>

    <lab-entry component="Menu" state="Submenu Open" source="src/components/menu/index.tsx:42">
      <Menu open>...</Menu>
    </lab-entry>
    <lab-entry component="Button" state="Hover" source="src/components/button/index.tsx:12" force="hover">
      <Button>Save</Button>
    </lab-entry>
  </lab-page>

  <lab-page>
    title   The page title in Title Case, such as "Components".
    root    The absolute project root. Each `source` path resolves against it.
    editor  "cursor" by default. Any scheme name such as "vscode" opens <scheme>://file/<file>:<line>.
            A value with braces is a URL template, such as "idea://open?file={file}&line={line}".
            The template fills {file}, {path}, {root}, {line} and {column}.

  <lab-entry>
    component  The component name, such as "Menu". Entries group under it in order of first use.
    state      The state shown, such as "Submenu Open".
    source     The file and line that renders the state, relative to root, such as "src/menu.tsx:42".
    force      Optional. Pseudo-classes held on the entry's top element: "hover", "active", "focus", "focus-visible" or "focus-within".
               Same-origin rules are rewritten so `.button:hover` also matches that element.

  <lab-tune>
    property  The CSS custom property to set on the root element, such as "--accent".
    min, max  The slider range. step defaults to 1.
    value     Where the slider starts. The app keeps its own value until the slider moves.
    format    The value written, with {} for the number, such as "{}px". Defaults to "{}".
    label     The slider label in Title Case. Defaults to the property name.

  Entries and tunes are direct children of <lab-page>. Entry content stays in the light DOM, so the app's own styles apply.
  The chrome lives in shadow DOM and follows the app's `color-scheme` through `light-dark()`.
  Its text uses Inter when the app loads it. Copy Values (Shift+C) copies every moved value.

  React, Vue and Svelte pass these as attributes. Load the file in the browser only, after hydration:

    "use client";
    import { useEffect } from "react";

    export default function Lab() {
      useEffect(() => {
        import("./lab.js");
      }, []);
      return (
        <lab-page title="Components" root="/Users/me/app">
          <lab-entry component="Menu" state="Submenu Open" source="src/components/menu/index.tsx:42">
            <Menu open />
          </lab-entry>
        </lab-page>
      );
    }

  TypeScript JSX declarations, in a .d.ts file:

    import type { DetailedHTMLProps, HTMLAttributes } from "react";

    type LabElement<T> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & T;

    declare module "react" {
      namespace JSX {
        interface IntrinsicElements {
          "lab-page": LabElement<{ title?: string; root?: string; editor?: string }>;
          "lab-entry": LabElement<{ component: string; state: string; source?: string; force?: string }>;
          "lab-tune": LabElement<{
            property: string;
            min: number | string;
            max: number | string;
            step?: number | string;
            value: number | string;
            format?: string;
            label?: string;
          }>;
        }
      }
    }
*/

(() => {
  if (typeof window === "undefined" || customElements.get("lab-page")) return;

  const tokens = `
    /* kit:tokens prefix=lab */
    --lab-gray-1: light-dark(#ffffff, #080808);
    --lab-gray-2: light-dark(#fafafa, #111111);
    --lab-gray-3: light-dark(#f2f2f2, #1a1a1a);
    --lab-gray-4: light-dark(#ebebeb, #222222);
    --lab-gray-5: light-dark(#e3e3e3, #2a2a2a);
    --lab-gray-10: light-dark(#6b6b6b, #8f8f8f);
    --lab-gray-11: light-dark(#575757, #b4b4b4);
    --lab-gray-12: light-dark(#080808, #ffffff);
    --lab-blue: #02bbff;
    --lab-red: light-dark(#d93036, #ff6369);
    --lab-green: light-dark(#2b9a66, #3dd68c);
    --lab-accent: var(--lab-blue);
    --lab-danger: var(--lab-red);
    --lab-success: var(--lab-green);
    --lab-text-primary: var(--lab-gray-12);
    --lab-text-secondary: color-mix(in oklab, var(--lab-gray-12) 80%, var(--lab-gray-11));
    --lab-text-tertiary: var(--lab-gray-11);
    --lab-text-quaternary: var(--lab-gray-10);
    --lab-text-on-accent: light-dark(#ffffff, #080808);
    --lab-border-primary: color-mix(in oklab, var(--lab-gray-12) 7%, transparent);
    --lab-border-secondary: color-mix(in oklab, var(--lab-gray-12) 12%, transparent);
    --lab-background-primary: var(--lab-gray-1);
    --lab-background-secondary: var(--lab-gray-2);
    --lab-background-tertiary: light-dark(rgb(8 8 8 / 5%), rgb(255 255 255 / 8%));
    --lab-background-hover: light-dark(rgb(8 8 8 / 8%), rgb(255 255 255 / 13%));
    --lab-background-raised: light-dark(#ffffff, #1a1a1a);
    --lab-background-control: light-dark(#ffffff, #222222);
    --lab-background-overlay: light-dark(#ffffff, #111111);
    --lab-fill-hover: light-dark(rgb(8 8 8 / 4%), rgb(255 255 255 / 6%));
    --lab-shadow-border: 0 0 0 1px light-dark(rgb(0 0 0 / 7%), rgb(255 255 255 / 7%));
    --lab-shadow-default:
      inset 0 0 0 0.5px light-dark(transparent, rgb(255 255 255 / 7%)),
      0 0 0 0.5px light-dark(rgb(0 0 0 / 6%), transparent),
      0 1px 1px -1px light-dark(rgb(0 0 0 / 10%), transparent),
      0 1px 2px 0 light-dark(rgb(0 0 0 / 5%), transparent);
    --lab-shadow-large:
      0 0 0 0.5px light-dark(oklab(0.802 0 0 / 0.297), transparent),
      0 0 0 1px light-dark(transparent, oklab(0.463 0 0 / 0.303)),
      0 2px 3px -2px light-dark(rgb(0 0 0 / 6.3%), rgb(0 0 0 / 15%)),
      0 3px 12px -4px light-dark(rgb(0 0 0 / 10%), transparent),
      0 4px 16px -8px light-dark(rgb(0 0 0 / 5%), transparent),
      0 3px 8px -2px light-dark(transparent, rgb(0 0 0 / 40%)),
      0 4px 12px -4px light-dark(transparent, rgb(0 0 0 / 50%));
    --lab-shadow-extra-large:
      inset 0 0 0 0.5px light-dark(transparent, rgb(255 255 255 / 7%)),
      0 0 0 0.5px light-dark(rgb(0 0 0 / 6%), transparent),
      0 8px 40px 0 rgb(0 0 0 / 5%),
      0 12px 32px -16px rgb(0 0 0 / 15%);
    --lab-font-sans: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    --lab-font-mono: ui-monospace, "SF Mono", Menlo, monospace;
    --lab-font-weight-400: "wght" 400, "opsz" 14;
    --lab-font-weight-500: "wght" 500, "opsz" 14;
    --lab-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --lab-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
    --lab-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
    --lab-duration-snappy: 220ms;
    --lab-duration-exit: 160ms;
    --lab-radius-control: 8px;
    --lab-radius-menu: 12px;
    --lab-radius-panel: 16px;
    /* kit:tokens end */
  `;

  const base = `
    *,
    *::before,
    *::after {
      box-sizing: border-box;
      padding: 0;
      margin: 0;
    }

    button,
    select {
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
    }

    button {
      cursor: pointer;
      user-select: none;
    }

    * {
      scrollbar-width: none;
    }

    ::-webkit-scrollbar {
      display: none;
    }

    :focus-visible {
      outline: 2px solid var(--lab-accent);
      outline-offset: 2px;
      border-radius: 4px;
    }

    [hidden] {
      display: none !important;
    }

    .text {
      font-family: var(--lab-font-sans);
      font-size: 14px;
      font-style: normal;
      line-height: 20px;
      font-variation-settings: var(--lab-font-weight-400);
      font-optical-sizing: none;
      font-feature-settings: "calt", "ccmp", "locl", "kern", "cv01", "ss03";
      letter-spacing: normal;
      text-align: left;
      text-transform: none;
      text-wrap: pretty;
      -webkit-font-smoothing: antialiased;
      color: var(--lab-text-primary);
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        transition-duration: 0s !important;
      }
    }
  `;

  function sheet(css) {
    const result = new CSSStyleSheet();
    result.replaceSync(css);
    return result;
  }

  const pageSheet = sheet(`
    :host {
      display: block;
      ${tokens}
    }

    ${base}

    /* kit:fade prefix=lab */
    @property --lab-fade-start {
      syntax: "<length>";
      inherits: false;
      initial-value: 0px;
    }

    @property --lab-fade-end {
      syntax: "<length>";
      inherits: false;
      initial-value: 0px;
    }

    @keyframes scroll-fade {
      0% {
        --lab-fade-start: 0px;
        --lab-fade-end: 24px;
      }
      10% {
        --lab-fade-start: 24px;
      }
      90% {
        --lab-fade-end: 24px;
      }
      100% {
        --lab-fade-start: 24px;
        --lab-fade-end: 0px;
      }
    }

    .scroll-fade {
      mask-image:
        linear-gradient(to bottom, transparent, black var(--lab-fade-start), black calc(100% - var(--lab-fade-end)), transparent),
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

    /* kit:head prefix=lab */
    .head {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 640px;
    }

    .title {
      font-variation-settings: var(--lab-font-weight-500);
    }

    .brief {
      color: var(--lab-text-tertiary);
      overflow-wrap: anywhere;

      a {
        display: inline-flex;
        gap: 4px;
        align-items: center;
        color: var(--lab-text-secondary);

        svg {
          color: var(--lab-text-quaternary);
        }

        &:active,
        &:active svg {
          color: var(--lab-text-primary);
        }
      }

      code {
        color: var(--lab-text-secondary);
      }
    }

    @property --lab-bar-line {
      syntax: "<color>";
      inherits: false;
      initial-value: transparent;
    }

    .bar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      padding: 16px 0;
      border-image: linear-gradient(to top, var(--lab-bar-line) 1px, var(--lab-background-primary) 1px) fill 0 / / 0 100vw;
      transition: --lab-bar-line var(--lab-duration-snappy) var(--lab-ease-out);

      &[data-stuck] {
        --lab-bar-line: var(--lab-border-primary);
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .brief a:hover,
      .brief a:hover svg {
        color: var(--lab-text-primary);
      }
    }
    /* kit:head end */

    /* kit:controls prefix=lab */
    .chip,
    .action {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      height: 28px;
      padding: 0 12px;
      font-size: 13px;
      font-variation-settings: var(--lab-font-weight-500);
      color: var(--lab-text-tertiary);
      white-space: nowrap;
      border-radius: var(--lab-radius-control);

      &[aria-pressed="true"] {
        color: var(--lab-text-primary);
        background: var(--lab-background-tertiary);
      }

      &:active:not(:disabled) {
        color: var(--lab-text-primary);
      }

      &:disabled {
        cursor: default;
        opacity: 0.5;
      }
    }

    .action {
      color: var(--lab-text-primary);
      background: var(--lab-background-tertiary);

      &:active:not(:disabled) {
        background: var(--lab-background-hover);
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
      color: var(--lab-text-tertiary);
      border-radius: var(--lab-radius-control);

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
      background: var(--lab-background-tertiary);

      &:active:not(:disabled, [aria-pressed="true"]) {
        color: var(--lab-text-primary);
        background: var(--lab-background-hover);
      }

      &[aria-pressed="true"] {
        color: var(--lab-text-on-accent);
        background: var(--lab-accent);
      }
    }

    .tool-button {
      &:active:not(:disabled) {
        color: var(--lab-text-primary);
        background: var(--lab-background-tertiary);
      }

      &[aria-pressed="true"] {
        color: var(--lab-text-primary);
        background: var(--lab-background-tertiary);
      }

      &[aria-pressed="true"]:active:not(:disabled) {
        background: var(--lab-background-hover);
      }
    }

    .pick {
      position: relative;
      display: grid;
      flex: none;
      place-items: center;
      width: 28px;
      height: 28px;
      color: var(--lab-text-quaternary);
      border-radius: var(--lab-radius-control);
      box-shadow: inset 0 0 0 1px var(--lab-border-secondary);

      &::before {
        position: absolute;
        inset: -6px;
        content: "";
      }

      &:active:not([aria-pressed="true"]) {
        color: var(--lab-text-primary);
      }

      &[aria-pressed="true"] {
        color: var(--lab-text-on-accent);
        background: var(--lab-accent);
        box-shadow: none;
      }
    }

    .count {
      color: var(--lab-text-quaternary);
      font-variant-numeric: tabular-nums;
    }

    @media (hover: hover) and (pointer: fine) {
      .chip:hover:not(:disabled) {
        color: var(--lab-text-primary);
      }

      .action:hover:not(:disabled) {
        background: var(--lab-background-hover);
      }

      .icon-button:hover:not(:disabled, [aria-pressed="true"]) {
        color: var(--lab-text-primary);
        background: var(--lab-background-hover);
      }

      .tool-button:hover:not(:disabled) {
        color: var(--lab-text-primary);
        background: var(--lab-background-tertiary);
      }

      .tool-button[aria-pressed="true"]:hover:not(:disabled) {
        background: var(--lab-background-hover);
      }

      .pick:hover:not([aria-pressed="true"]) {
        color: var(--lab-text-primary);
      }
    }
    /* kit:controls end */

    /* kit:select prefix=lab */
    .select {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      max-width: 280px;
      height: 28px;
      padding: 0 28px 0 12px;
      font-size: 13px;
      font-variation-settings: var(--lab-font-weight-500);
      color: var(--lab-text-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      appearance: none;
      background: var(--lab-background-tertiary) no-repeat right 11px center / 10px
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='%236b6b6b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 4l2.5 2.5L7.5 4'/%3E%3C/svg%3E");
      border-radius: var(--lab-radius-control);

      &:active {
        background-color: var(--lab-background-hover);
      }
    }

    @supports (appearance: base-select) {
      .select,
      .select::picker(select) {
        appearance: base-select;
      }

      .select {
        padding-right: 12px;
        background-image: none;

        &::picker-icon {
          width: 10px;
          height: 10px;
          content: "";
          background: var(--lab-text-quaternary);
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 4l2.5 2.5L7.5 4'/%3E%3C/svg%3E");
          transition: rotate var(--lab-duration-snappy) var(--lab-ease-out);
        }

        &:open::picker-icon {
          rotate: 180deg;
        }

        selectedcontent {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        &::picker(select) {
          min-width: anchor-size(width);
          max-height: min(400px, 60dvh);
          scrollbar-width: none;
          padding: 4px;
          margin-block: 8px;
          background: var(--lab-background-raised);
          border: 1px solid transparent;
          border-radius: var(--lab-radius-menu);
          box-shadow: var(--lab-shadow-large);
          opacity: 0;
          mask-image:
            linear-gradient(to bottom, transparent, black var(--lab-fade-start), black calc(100% - var(--lab-fade-end)), transparent),
            linear-gradient(black, black),
            linear-gradient(black, black);
          mask-clip: border-box, border-box, no-clip;
          mask-size: 100% 100%, 100% 100%, calc(100% + 128px) calc(100% + 128px);
          mask-position: 0 0, 0 0, -64px -64px;
          mask-repeat: no-repeat;
          mask-composite: add, exclude;
          animation: scroll-fade linear both;
          animation-timeline: scroll(self);
          transition:
            opacity var(--lab-duration-exit) var(--lab-ease-out),
            display var(--lab-duration-exit) allow-discrete,
            overlay var(--lab-duration-exit) allow-discrete;
        }

        &:open::picker(select) {
          opacity: 1;
          transition-duration: var(--lab-duration-snappy);

          @starting-style {
            opacity: 0;
          }
        }
      }

      .select option {
        display: flex;
        gap: 6px;
        align-items: center;
        height: 28px;
        padding: 0 8px;
        font-size: 13px;
        font-variation-settings: var(--lab-font-weight-500);
        color: var(--lab-text-tertiary);
        white-space: nowrap;
        cursor: pointer;
        border-radius: var(--lab-radius-control);

        &:active {
          color: var(--lab-text-primary);
          background: var(--lab-fill-hover);
        }

        &:focus-visible {
          color: var(--lab-text-primary);
          background: var(--lab-background-tertiary);
          outline: none;
        }

        &:checked {
          color: var(--lab-text-primary);
        }

        &::checkmark {
          order: 1;
          margin-left: auto;
          padding-left: 16px;
          color: var(--lab-accent);
        }
      }
    }

    @media (width <= 640px) {
      .select {
        font-size: 16px;
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .select:hover {
        background-color: var(--lab-background-hover);
      }

      .select option:hover {
        color: var(--lab-text-primary);
        background: var(--lab-fill-hover);
      }
    }
    /* kit:select end */

    /* kit:overlays prefix=lab */
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
      font-variation-settings: var(--lab-font-weight-500);
      color: var(--lab-text-primary);
      white-space: nowrap;
      pointer-events: none;
      background: var(--lab-background-raised);
      border: 1px solid transparent;
      border-radius: 10px;
      box-shadow: var(--lab-shadow-large);
      opacity: 0;
      translate: -50% 4px;
      scale: 0.97;
      transform-origin: bottom center;
      transition:
        opacity var(--lab-duration-exit) var(--lab-ease-out),
        translate var(--lab-duration-exit) var(--lab-ease-out),
        scale var(--lab-duration-exit) var(--lab-ease-out);

      &[data-side="below"] {
        translate: -50% -4px;
        transform-origin: top center;
      }

      &[data-open] {
        opacity: 1;
        translate: -50% 0;
        scale: 1;
        transition-duration: var(--lab-duration-snappy);
      }

      &:has(button) {
        gap: 12px;
        padding-right: 4px;
        pointer-events: auto;
      }

      button {
        height: 24px;
        padding: 0 8px;
        color: var(--lab-accent);
        border-radius: 6px;

        &:active {
          background: var(--lab-background-hover);
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
      font-variation-settings: var(--lab-font-weight-500);
      color: var(--lab-text-primary);
      white-space: nowrap;
      pointer-events: none;
      background: var(--lab-background-raised);
      border: 1px solid transparent;
      border-radius: var(--lab-radius-control);
      box-shadow: var(--lab-shadow-large);
      translate: -50% 0;
      transition:
        opacity 125ms var(--lab-ease-out),
        translate 125ms var(--lab-ease-out);

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

      kbd {
        font: inherit;
        color: var(--lab-text-tertiary);
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .toast button:hover {
        background: var(--lab-background-hover);
      }
    }
    /* kit:overlays end */

    .page {
      --lab-inset: 48px;
      width: min(768px, 100% - var(--lab-inset) * 2);
      margin: 0 auto;
      padding: 96px 0 128px;

      @media (width <= 640px) {
        --lab-inset: 24px;
        padding-top: 64px;
      }
    }

    .title {
      text-wrap: balance;
    }

    .sentinel {
      display: block;
      height: 0;
      margin-top: 48px;
    }

    .page > .sentinel:first-child {
      margin-top: 0;
    }

    .filters,
    .tune {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }

    .tune {
      flex-basis: 100%;
    }

    .copy {
      display: flex;
      margin-left: auto;
    }

    /* kit:inputs prefix=lab */
    .input {
      width: 100%;
      min-width: 0;
      height: 28px;
      padding: 0 10px;
      font-size: 13px;
      color: var(--lab-text-primary);
      background: var(--lab-background-tertiary);
      border-radius: var(--lab-radius-control);

      &::placeholder {
        color: var(--lab-text-quaternary);
      }

      &:focus-visible {
        outline-offset: 0;
        border-radius: var(--lab-radius-control);
      }
    }

    textarea.input {
      height: auto;
      min-height: 72px;
      padding: 8px 10px;
      resize: vertical;
    }

    .search {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      height: 28px;
      padding: 0 10px;
      color: var(--lab-text-quaternary);
      background: var(--lab-background-tertiary);
      border-radius: var(--lab-radius-control);

      svg {
        flex: none;
      }

      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        font-size: 13px;
        color: var(--lab-text-primary);
        background: none;
        outline: none;

        &::placeholder {
          color: var(--lab-text-quaternary);
        }

        &::-webkit-search-cancel-button {
          appearance: none;
        }
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--lab-accent);
      }
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-label {
      color: var(--lab-text-tertiary);
    }

    .range {
      display: inline-flex;
      gap: 10px;
      align-items: center;
      height: 28px;
      padding: 0 12px;
      font-size: 13px;
      font-variation-settings: var(--lab-font-weight-500);
      color: var(--lab-text-tertiary);
      white-space: nowrap;
      background: var(--lab-background-tertiary);
      border-radius: var(--lab-radius-control);

      output {
        min-width: 4ch;
        color: var(--lab-text-primary);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }

      input {
        --lab-fill: 50%;
        width: 88px;
        height: 28px;
        cursor: pointer;
        appearance: none;
        background: none;
        outline: none;

        &::-webkit-slider-runnable-track {
          height: 4px;
          background: linear-gradient(to right, var(--lab-accent) var(--lab-fill), var(--lab-border-secondary) var(--lab-fill));
          border-radius: 999px;
        }

        &::-moz-range-track {
          height: 4px;
          background: linear-gradient(to right, var(--lab-accent) var(--lab-fill), var(--lab-border-secondary) var(--lab-fill));
          border-radius: 999px;
        }

        &::-webkit-slider-thumb {
          width: 14px;
          height: 14px;
          margin-top: -5px;
          appearance: none;
          background: var(--lab-background-control);
          border-radius: 999px;
          box-shadow: var(--lab-shadow-default);
        }

        &::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: var(--lab-background-control);
          border: 0;
          border-radius: 999px;
          box-shadow: var(--lab-shadow-default);
        }
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--lab-accent);
        outline-offset: 2px;
      }
    }

    .segmented {
      display: inline-flex;
      padding: 2px;
      background: var(--lab-background-tertiary);
      border-radius: 10px;

      button {
        height: 24px;
        padding: 0 10px;
        font-size: 13px;
        font-variation-settings: var(--lab-font-weight-500);
        color: var(--lab-text-tertiary);
        white-space: nowrap;
        border-radius: 8px;

        &:active {
          color: var(--lab-text-primary);
        }

        &[aria-pressed="true"] {
          color: var(--lab-text-primary);
          background: var(--lab-background-control);
          box-shadow: var(--lab-shadow-default);
        }
      }
    }

    @media (width <= 640px) {
      .input,
      .search input {
        font-size: 16px;
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .segmented button:hover {
        color: var(--lab-text-primary);
      }
    }
    /* kit:inputs end */

    .groups {
      display: flex;
      flex-direction: column;
      gap: 64px;
      margin-top: 32px;
    }

    .group-head {
      margin-bottom: 20px;
    }

    .group-title {
      font-variation-settings: var(--lab-font-weight-500);
      text-wrap: balance;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(224px, 1fr));
      gap: 24px;
    }
  `);

  const entrySheet = sheet(`
    :host {
      display: block;
      min-width: 0;
      ${tokens}
    }

    ${base}

    .cell {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .label {
      display: flex;
      gap: 12px;
      align-items: baseline;
      justify-content: space-between;
      font-size: 13px;
    }

    .state {
      overflow: hidden;
      font-variation-settings: var(--lab-font-weight-500);
      color: var(--lab-text-secondary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source {
      display: inline-flex;
      flex: none;
      gap: 4px;
      align-items: center;
      color: var(--lab-text-quaternary);
      text-decoration: none;
      font-variant-numeric: tabular-nums;

      &:active {
        color: var(--lab-text-primary);
      }

      svg {
        display: block;
      }
    }

    @media (hover: hover) and (pointer: fine) {
      .source:hover {
        color: var(--lab-text-primary);
      }
    }

    .stage {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: center;
      min-height: 128px;
      padding: 24px;
      border-radius: 10px;
      box-shadow: inset 0 0 0 1px var(--lab-border-primary);
    }
  `);

  // kit:anchor
  function anchorTo(popover, anchor) {
    const rect = anchor.getBoundingClientRect();
    const frame = (
      anchor.closest("[data-frame]") ?? anchor
    ).getBoundingClientRect();
    const half = popover.offsetWidth / 2;
    const edge = document.documentElement.clientWidth - 8;
    const below = frame.top < popover.offsetHeight + 16;
    popover.style.left = `${Math.min(edge - half, Math.max(8 + half, rect.left + rect.width / 2))}px`;
    popover.style.top = `${below ? frame.bottom + 8 : frame.top - 8 - popover.offsetHeight}px`;
    popover.dataset.side = below ? "below" : "above";
  }
  // kit:anchor end

  const external = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 4.5h6v6M11.5 4.5l-7 7" /></svg>`;

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "html") node.innerHTML = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children.filter((child) => child != null));
    return node;
  }

  const titleCase = (text) =>
    text
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(
        /(^|\s)(\p{Ll})/gu,
        (_, space, letter) => space + letter.toUpperCase(),
      );

  const unique = (values) => [...new Set(values)];

  function editorHref(editor, root, source) {
    const [, path, line, column] = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(
      source.trim(),
    );
    const isAbsolute = /^(\/|[a-z]:[\\/])/i.test(path);
    const file = (
      isAbsolute
        ? path
        : `${root.replace(/[\\/]+$/, "")}/${path.replace(/^\.?[\\/]/, "")}`
    ).replace(/\\/g, "/");
    if (editor.includes("{")) {
      const fill = {
        file,
        path,
        root,
        line: line ?? "1",
        column: column ?? "1",
      };
      return editor.replace(/\{(file|path|root|line|column)\}/g, (_, key) =>
        encodeURI(fill[key]),
      );
    }
    const position = [line, column]
      .filter(Boolean)
      .map((part) => `:${part}`)
      .join("");
    return `${editor}://file${file.startsWith("/") ? "" : "/"}${encodeURI(file)}${position}`;
  }

  const pseudo = /:(hover|active|focus-visible|focus-within|focus)(?![\w-])/g;

  function forceRules(rules) {
    for (const rule of rules) {
      const selector = rule.selectorText;
      if (selector && !selector.includes("lab-entry[force")) {
        const forced = selector.replace(
          pseudo,
          (match, name) =>
            `:is(${match}, :where(lab-entry[force~="${name}"]) > *)`,
        );
        if (forced !== selector) rule.selectorText = forced;
      }
      if (rule.cssRules) forceRules(rule.cssRules);
    }
  }

  function forceStates() {
    for (const styleSheet of [
      ...document.styleSheets,
      ...document.adoptedStyleSheets,
    ]) {
      try {
        forceRules(styleSheet.cssRules);
      } catch {}
    }
  }

  let warned = false;

  class LabEntry extends HTMLElement {
    static observedAttributes = ["component", "state", "source", "force"];

    #state;
    #source;

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.adoptedStyleSheets = [entrySheet];
      this.#state = h("span", { class: "state" });
      this.#source = h("a", { class: "source", hidden: "" });
      root.append(
        h(
          "figure",
          { class: "cell" },
          h("figcaption", { class: "label text" }, this.#state, this.#source),
          h("div", { class: "stage" }, h("slot")),
        ),
      );
    }

    get component() {
      return this.getAttribute("component") ?? "";
    }

    get state() {
      return this.getAttribute("state") ?? "";
    }

    connectedCallback() {
      this.refresh();
    }

    attributeChangedCallback() {
      this.refresh();
      this.dispatchEvent(new Event("lab-change", { bubbles: true }));
    }

    refresh() {
      this.#state.textContent = titleCase(this.state);
      const source = this.getAttribute("source");
      this.#source.hidden = !source;
      if (!source) return;
      const page = this.closest("lab-page");
      const root = page?.getAttribute("root") ?? "";
      if (!root && !/^(\/|[a-z]:[\\/])/i.test(source) && !warned) {
        warned = true;
        console.warn(
          'lab: set root="/absolute/project/path" on <lab-page> so source links open.',
        );
      }
      const [path, line] = source.split(/:(?=\d)/);
      this.#source.href = editorHref(
        page?.getAttribute("editor") || "cursor",
        root,
        source,
      );
      this.#source.title = source;
      this.#source.innerHTML = external;
      this.#source.prepend(
        `${path.split(/[\\/]/).pop()}${line ? `:${line}` : ""}`,
      );
    }
  }

  class LabTune extends HTMLElement {
    static observedAttributes = [
      "property",
      "label",
      "min",
      "max",
      "step",
      "value",
      "format",
    ];

    attributeChangedCallback() {
      this.dispatchEvent(new Event("lab-change", { bubbles: true }));
    }
  }

  class LabPage extends HTMLElement {
    static observedAttributes = ["title", "root", "editor"];

    #title = "";
    #filters = { component: null, state: null };
    #tunes = new Map();
    #tuneKey = "";
    #queued = false;
    #observer = new MutationObserver(() => this.#schedule());
    #heading;
    #sentinel;
    #bar;
    #componentFilter;
    #stateFilter;
    #tuneRow;
    #copy;
    #copyButton;
    #toast;
    #groups;
    #sections = new Map();

    constructor() {
      super();
      const root = this.attachShadow({
        mode: "open",
        slotAssignment: "manual",
      });
      root.adoptedStyleSheets = [pageSheet];
      this.#heading = h("h1", { class: "title text" });
      this.#sentinel = h("i", { class: "sentinel" });
      this.#componentFilter = h("select", {
        class: "select text",
        "aria-label": "Component",
      });
      this.#stateFilter = h("select", {
        class: "select text",
        "aria-label": "State",
      });
      this.#copyButton = h(
        "button",
        {
          class: "action text",
          type: "button",
          title: "Copy Values (⇧C)",
          "aria-keyshortcuts": "Shift+C",
          disabled: "",
        },
        "Copy Values",
      );
      this.#toast = h("output", { class: "toast text", popover: "manual" });
      this.#copy = h(
        "span",
        { class: "copy", hidden: "" },
        this.#copyButton,
        this.#toast,
      );
      this.#tuneRow = h("div", { class: "tune", hidden: "" });
      this.#bar = h(
        "nav",
        { class: "bar", "aria-label": "Filters" },
        h(
          "div",
          { class: "filters" },
          this.#componentFilter,
          this.#stateFilter,
        ),
        this.#tuneRow,
      );
      this.#groups = h("main", { class: "groups" });
      root.append(
        h(
          "div",
          { class: "page" },
          this.#heading,
          this.#sentinel,
          this.#bar,
          this.#groups,
        ),
      );

      this.#componentFilter.addEventListener("change", (event) => {
        this.#filters.component = event.target.value || null;
        this.#render();
      });
      this.#stateFilter.addEventListener("change", (event) => {
        this.#filters.state = event.target.value || null;
        this.#render();
      });
      this.#copyButton.addEventListener("click", () => this.#copyValues());
      this.addEventListener("lab-change", () => this.#schedule());
    }

    get title() {
      return this.#title;
    }

    set title(value) {
      this.#title = String(value ?? "");
      this.#renderTitle();
    }

    attributeChangedCallback(name, _, value) {
      if (name === "title") {
        if (value === null) return;
        this.title = value;
        this.removeAttribute("title");
        return;
      }
      for (const entry of this.#entries()) entry.refresh();
    }

    connectedCallback() {
      this.#observer.observe(this, { childList: true });
      this.#styleObserver.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      document.addEventListener("load", this.#onStyleLoad, true);
      document.addEventListener("scroll", this.#markStuck, {
        capture: true,
        passive: true,
      });
      document.addEventListener("keydown", this.#onKeydown);
      addEventListener("resize", this.#markStuck, { passive: true });
      for (const tune of this.#tunes.values())
        if (tune.changed) this.#apply(tune);
      this.#renderTitle();
      this.#render();
    }

    disconnectedCallback() {
      this.#observer.disconnect();
      this.#styleObserver.disconnect();
      document.removeEventListener("load", this.#onStyleLoad, true);
      document.removeEventListener("scroll", this.#markStuck, {
        capture: true,
      });
      document.removeEventListener("keydown", this.#onKeydown);
      removeEventListener("resize", this.#markStuck);
      for (const tune of this.#tunes.values()) {
        if (tune.changed)
          document.documentElement.style.removeProperty(tune.property);
      }
    }

    #styleObserver = new MutationObserver(() => this.#forceIfNeeded());

    #onStyleLoad = (event) => {
      if (event.target.localName === "link") this.#forceIfNeeded();
    };

    #forceIfNeeded() {
      if (this.#entries().some((entry) => entry.hasAttribute("force")))
        forceStates();
    }

    #markStuck = () => {
      const stuck =
        this.#bar.getBoundingClientRect().top >
        this.#sentinel.getBoundingClientRect().bottom + 0.5;
      this.#bar.toggleAttribute("data-stuck", stuck);
    };

    #onKeydown = (event) => {
      if (
        !event.shiftKey ||
        event.code !== "KeyC" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.composedPath()[0];
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable]")
      )
        return;
      if (this.#copy.hidden) return;
      event.preventDefault();
      this.#copyValues();
    };

    #entries() {
      return [...this.children].filter(
        (node) => node.localName === "lab-entry",
      );
    }

    #schedule() {
      if (this.#queued) return;
      this.#queued = true;
      queueMicrotask(() => {
        this.#queued = false;
        if (this.isConnected) this.#render();
      });
    }

    #renderTitle() {
      this.#heading.textContent = this.#title;
      this.#heading.hidden = !this.#title;
    }

    #render() {
      const entries = this.#entries();
      const filters = this.#filters;
      const components = unique(entries.map((entry) => entry.component));
      if (!components.includes(filters.component)) filters.component = null;
      const scoped = entries.filter(
        (entry) =>
          filters.component === null || entry.component === filters.component,
      );
      const states = unique(scoped.map((entry) => entry.state));
      if (!states.includes(filters.state)) filters.state = null;

      const option = (value, label, count) =>
        h(
          "option",
          { value },
          label,
          " ",
          h("span", { class: "count" }, String(count)),
        );
      this.#componentFilter.replaceChildren(
        option("", "All Components", entries.length),
        ...components.map((name) =>
          option(
            name,
            titleCase(name),
            entries.filter((entry) => entry.component === name).length,
          ),
        ),
      );
      this.#componentFilter.value = filters.component ?? "";
      this.#stateFilter.replaceChildren(
        option("", "All States", scoped.length),
        ...states.map((state) =>
          option(
            state,
            titleCase(state),
            scoped.filter((entry) => entry.state === state).length,
          ),
        ),
      );
      this.#stateFilter.value = filters.state ?? "";

      for (const [name, section] of this.#sections) {
        if (!components.includes(name)) {
          section.node.remove();
          this.#sections.delete(name);
        }
      }
      for (const name of components) {
        let section = this.#sections.get(name);
        if (!section) {
          const slot = h("slot");
          const title = h("h2", { class: "group-title text" });
          const node = h(
            "section",
            { class: "group" },
            h("header", { class: "group-head" }, title),
            h("div", { class: "grid" }, slot),
          );
          section = { node, slot, title };
          this.#sections.set(name, section);
        }
        section.title.textContent = titleCase(name);
        const visible = scoped.filter(
          (entry) =>
            entry.component === name &&
            (filters.state === null || entry.state === filters.state),
        );
        section.node.hidden = visible.length === 0;
        section.slot.assign(...visible);
        this.#groups.append(section.node);
      }

      this.#renderTunes();
      this.#forceIfNeeded();
      this.#markStuck();
    }

    #renderTunes() {
      const nodes = [...this.children].filter(
        (node) => node.localName === "lab-tune",
      );
      const read = (node) => ({
        property: node.getAttribute("property") ?? "",
        label:
          node.getAttribute("label") ||
          titleCase(node.getAttribute("property")?.replace(/^--/, "") ?? ""),
        min: Number(node.getAttribute("min") ?? 0),
        max: Number(node.getAttribute("max") ?? 100),
        step: node.getAttribute("step") ?? "1",
        start: node.getAttribute("value") ?? node.getAttribute("min") ?? "0",
        format: node.getAttribute("format") || "{}",
      });
      const specs = nodes
        .map(read)
        .filter((spec) => spec.property.startsWith("--"));
      const key = JSON.stringify(specs);
      if (key === this.#tuneKey) return;
      this.#tuneKey = key;

      const previous = this.#tunes;
      this.#tunes = new Map();
      for (const [property] of previous) {
        if (!specs.some((spec) => spec.property === property)) {
          document.documentElement.style.removeProperty(property);
        }
      }

      const controls = specs.map((spec) => {
        const kept = previous.get(spec.property);
        const tune = {
          ...spec,
          value: kept?.changed ? kept.value : spec.start,
          changed: kept?.changed ?? false,
        };
        this.#tunes.set(spec.property, tune);
        const slider = h("input", {
          type: "range",
          min: spec.min,
          max: spec.max,
          step: spec.step,
          "aria-label": spec.label,
        });
        slider.value = tune.value;
        const readout = h("output");
        const sync = () => {
          readout.textContent = slider.value;
          const fill =
            ((Number(slider.value) - spec.min) / (spec.max - spec.min || 1)) *
            100;
          slider.style.setProperty("--lab-fill", `${fill}%`);
        };
        slider.addEventListener("input", () => {
          tune.value = slider.value;
          tune.changed = true;
          this.#apply(tune);
          sync();
          this.#copyButton.disabled = false;
        });
        sync();
        if (tune.changed) this.#apply(tune);
        return h("label", { class: "range text" }, spec.label, slider, readout);
      });

      this.#tuneRow.replaceChildren(...controls, this.#copy);
      this.#tuneRow.hidden = controls.length === 0;
      this.#copy.hidden = controls.length === 0;
      this.#copyButton.disabled = ![...this.#tunes.values()].some(
        (tune) => tune.changed,
      );
    }

    #apply(tune) {
      document.documentElement.style.setProperty(
        tune.property,
        tune.format.replaceAll("{}", tune.value),
      );
    }

    async #copyValues() {
      const changed = [...this.#tunes.values()].filter((tune) => tune.changed);
      if (changed.length === 0) return;
      const lines = changed.map(
        (tune) =>
          `${tune.property}: ${tune.format.replaceAll("{}", tune.value)};`,
      );
      const text = `Set these values from ${this.#title || "the lab"}:\n\n${lines.join("\n")}\n`;
      const tokens = Math.ceil(text.length / 4).toLocaleString();
      const message = await navigator.clipboard.writeText(text).then(
        () => `Copied · ~${tokens} tokens`,
        () => "Copy Failed",
      );
      const toast = this.#toast;
      clearTimeout(toast.hide);
      delete toast.dataset.open;
      if (!toast.matches(":popover-open")) toast.showPopover();
      toast.textContent = message;
      anchorTo(toast, this.#copyButton);
      toast.dataset.open = "";
      toast.hide = setTimeout(() => {
        delete toast.dataset.open;
        toast.hide = setTimeout(() => toast.hidePopover(), 200);
      }, 1600);
    }
  }

  customElements.define("lab-entry", LabEntry);
  customElements.define("lab-tune", LabTune);
  customElements.define("lab-page", LabPage);
})();

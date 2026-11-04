/*
  Prototype switcher. Copy this file into the app beside the prototype route, load it once and write the variants only.

  <prototype-switcher>
    <section data-variant="Inline Filters" data-note="One row of pills above the grid">...</section>
    <section data-variant="Sidebar List" data-note="Groups in a left column beside the grid">...</section>
  </prototype-switcher>

  Each direct child with `data-variant` is one variant. The label is two or three words of Title Case that say how it differs. `data-note` is one optional line shown in Show All. Hidden variants stay mounted, so their state survives switching.

  Plain HTML, Svelte and Astro: load it with <script src="switcher.js"></script>, or import "./switcher.js" from a module.

  React: import it once in the route file, which is a "use client" file in Next.js. It does nothing on the server, so the import is safe there.

    "use client";
    import "./switcher.js";

    export default function FiltersPrototype() {
      return (
        <prototype-switcher>
          <section data-variant="Inline Filters" data-note="One row of pills above the grid">
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

  The bar renders in a shadow root and inherits only `color-scheme` from the app, so it matches whatever theme the app sets on its root. It sits at the bottom centre. The current variant lives in `?variant=inline-filters`, and Show All in `?variant=all`. Pick copies "Pick Inline Filters from /prototypes/filters". Keys: ← and → step, 1–9 jump, A toggles Show All, P picks and Escape leaves it. Keys are ignored while focus is in a field.
*/

if (
  typeof window !== "undefined" &&
  !customElements.get("prototype-switcher")
) {
  const css = `
    :host {
      display: block;
    }

    :host([hidden]),
    .variant[hidden],
    .head[hidden] {
      display: none;
    }

    .variant {
      display: block;
      scroll-margin: 24px 0 96px;
    }

    .variants[data-all] .variant + .variant {
      margin-top: 64px;
    }

    .end {
      height: 80px;
    }

    .ui {
      all: initial;
      --gray-1: light-dark(#fdfdfc, #111110);
      --gray-2: light-dark(#f9f9f8, #191918);
      --gray-3: light-dark(#f1f0ef, #222221);
      --gray-4: light-dark(#e9e8e6, #2a2a28);
      --gray-10: light-dark(#82827c, #7c7b74);
      --gray-11: light-dark(#63635e, #b5b3ad);
      --gray-12: light-dark(#21201c, #eeeeec);
      --accent: #02bbff;
      --border-primary: color-mix(in oklab, var(--gray-12) 7%, transparent);
      --border-secondary: color-mix(in oklab, var(--gray-12) 12%, transparent);
      --text-primary: var(--gray-12);
      --text-tertiary: var(--gray-11);
      --text-quaternary: var(--gray-10);
      --background-tertiary: var(--gray-3);
      --shadow-raised:
        0 0 0 1px var(--border-secondary),
        0 1px 2px light-dark(oklch(0 0 0 / 4%), oklch(0 0 0 / 12%)),
        0 4px 12px light-dark(oklch(0 0 0 / 3%), oklch(0 0 0 / 9%));
      --font-weight-400: "wght" 400, "opsz" 14;
      --font-weight-500: "wght" 500, "opsz" 14;
      --ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
      --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
      --duration-snappy: 220ms;
      color-scheme: inherit;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 20px;
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

    .head {
      position: relative;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      align-items: baseline;
      margin-bottom: 20px;

      &::before {
        position: absolute;
        top: 7px;
        left: -14px;
        width: 6px;
        height: 6px;
        content: "";
        background: var(--accent);
        border-radius: 999px;
        opacity: 0;
        scale: 0.5;
        transition:
          opacity var(--duration-snappy) var(--ease-out-cubic),
          scale var(--duration-snappy) var(--ease-out-cubic);
      }

      .variant[data-current] > &::before {
        opacity: 1;
        scale: 1;
      }
    }

    .title {
      font-variation-settings: var(--font-weight-500);
    }

    .note {
      color: var(--text-tertiary);
    }

    .bar {
      --spring: linear(0, 0.2414, 0.6338, 0.9173, 1.0476, 1.0726, 1.0514, 1.0231, 1.0041, 0.9959, 0.9948, 0.9966, 0.9986, 0.9998, 1);
      position: fixed;
      inset: auto 0 calc(16px + env(safe-area-inset-bottom));
      display: none;
      gap: 8px;
      align-items: center;
      width: max-content;
      height: 44px;
      padding: 6px;
      margin: 0 auto;
      overflow: visible;
      background: color-mix(in oklab, var(--gray-1) 92%, transparent);
      border-radius: 999px;
      box-shadow: var(--shadow-raised);
      opacity: 0;
      translate: 0 12px;
      scale: 0.9;
      transform-origin: bottom center;
      backdrop-filter: blur(12px);
      transition:
        opacity 200ms ease-in,
        translate 200ms ease-in,
        scale 200ms ease-in,
        display 200ms allow-discrete,
        overlay 200ms allow-discrete;

      &:popover-open {
        display: flex;
        opacity: 1;
        translate: 0;
        scale: 1;
        transition:
          opacity var(--duration-snappy) var(--ease-out-cubic),
          translate 450ms var(--spring),
          scale 450ms var(--spring);

        @starting-style {
          opacity: 0;
          translate: 0 12px;
          scale: 0.9;
        }
      }
    }

    .divider {
      flex: none;
      width: 1px;
      height: 12px;
      background: var(--border-secondary);
    }

    .select {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      max-width: min(280px, 100vw - 176px);
      height: 32px;
      padding: 0 28px 0 12px;
      font-size: 13px;
      font-variation-settings: var(--font-weight-500);
      color: var(--text-primary);
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      appearance: none;
      background: var(--background-tertiary) no-repeat right 11px center / 10px
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='%2382827c' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 4l2.5 2.5L7.5 4'/%3E%3C/svg%3E");
      border-radius: 999px;
      transition: background-color var(--duration-snappy) var(--ease-out-cubic);

      @media (hover: hover) {
        &:hover {
          background-color: var(--gray-4);
        }
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
          background: var(--text-quaternary);
          mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2.5 4l2.5 2.5L7.5 4'/%3E%3C/svg%3E");
          transition: rotate var(--duration-snappy) var(--ease-out-cubic);
        }

        &:open::picker-icon {
          rotate: 180deg;
        }

        &::picker(select) {
          min-width: anchor-size(width);
          max-height: min(400px, 60dvh);
          scrollbar-width: none;
          padding: 4px;
          margin-block: 14px;
          background: var(--gray-2);
          border: 0;
          border-radius: 12px;
          box-shadow: var(--shadow-raised);
          opacity: 0;
          transition:
            opacity var(--duration-snappy) var(--ease-out-cubic),
            display var(--duration-snappy) allow-discrete,
            overlay var(--duration-snappy) allow-discrete;
        }

        &:open::picker(select) {
          opacity: 1;

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
        font-variation-settings: var(--font-weight-500);
        color: var(--text-tertiary);
        white-space: nowrap;
        cursor: pointer;
        border-radius: 8px;

        & + & {
          margin-top: 1px;
        }

        &:hover,
        &:focus-visible {
          color: var(--text-primary);
          background: var(--background-tertiary);
          outline: none;
        }

        &:checked {
          color: var(--text-primary);
        }

        &::checkmark {
          order: 1;
          padding-left: 16px;
          margin-left: auto;
          color: var(--accent);
        }
      }
    }

    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--text-tertiary);
      border-radius: 999px;
      transition:
        color var(--duration-snappy) var(--ease-out-cubic),
        background-color var(--duration-snappy) var(--ease-out-cubic),
        scale 100ms var(--ease-out-cubic);

      @media (hover: hover) {
        &:hover {
          color: var(--text-primary);
          background: var(--background-tertiary);
        }
      }

      &:active {
        scale: 0.92;
      }

      &[aria-pressed="true"] {
        color: var(--accent);
        background: light-dark(
          color-mix(in oklab, var(--accent) 14%, transparent),
          color-mix(in oklab, var(--accent) 24%, transparent)
        );
      }
    }

    .tipped {
      position: relative;
      display: flex;
      flex: none;
    }

    .tip {
      position: absolute;
      bottom: calc(100% + 14px);
      left: 50%;
      display: inline-flex;
      gap: 4px;
      align-items: center;
      height: 28px;
      padding: 0 10px;
      font-size: 12px;
      font-variation-settings: var(--font-weight-500);
      white-space: nowrap;
      pointer-events: none;
      background: var(--gray-2);
      border-radius: 8px;
      box-shadow: var(--shadow-raised);
      opacity: 0;
      translate: -50% 4px;
      scale: 0.97;
      transform-origin: bottom center;
      transition:
        opacity 135ms var(--ease-out-cubic),
        translate 135ms var(--ease-out-cubic),
        scale 135ms var(--ease-out-cubic);

      kbd {
        color: var(--text-quaternary);
      }
    }

    @media (hover: hover) {
      .tipped:hover .tip {
        opacity: 1;
        translate: -50% 0;
        scale: 1;
        transition-delay: 850ms;

        .bar[data-warm] & {
          transition-delay: 0s;
        }
      }
    }

    .tipped:has(:focus-visible) .tip {
      opacity: 1;
      translate: -50% 0;
      scale: 1;
      transition-delay: 0s;
    }

    .tipped:has(:disabled) .tip,
    .bar:has([data-toasting]) .tip {
      opacity: 0 !important;
    }

    .toast {
      position: absolute;
      bottom: calc(100% + 14px);
      left: calc(50% + var(--nudge, 0px));
      display: inline-flex;
      gap: 8px;
      align-items: center;
      height: 32px;
      padding: 0 12px 0 10px;
      font-size: 13px;
      font-variation-settings: var(--font-weight-500);
      white-space: nowrap;
      pointer-events: none;
      background: var(--gray-2);
      border-radius: 999px;

      .tick {
        flex: none;
        color: var(--accent);

        path {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          transition: stroke-dashoffset 320ms var(--ease-out-quart) 80ms;
        }
      }

      .count {
        font-variation-settings: var(--font-weight-400);
        font-variant-numeric: tabular-nums;
        color: var(--text-tertiary);
      }

      &[data-failed] {
        padding-left: 12px;

        .tick,
        .count {
          display: none;
        }
      }

      &[data-open] .tick path {
        stroke-dashoffset: 0;
      }
      box-shadow: var(--shadow-raised);
      opacity: 0;
      translate: -50% 4px;
      scale: 0.97;
      transform-origin: bottom center;
      transition:
        opacity var(--duration-snappy) var(--ease-out-cubic),
        translate var(--duration-snappy) var(--ease-out-cubic),
        scale var(--duration-snappy) var(--ease-out-cubic);

      &[data-side="below"] {
        top: calc(100% + 14px);
        bottom: auto;
        translate: -50% -4px;
        transform-origin: top center;
      }

      &[data-open] {
        opacity: 1;
        translate: -50% 0;
        scale: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ui,
      .ui *,
      .ui *::before,
      .ui *::after {
        transition-duration: 0s !important;
      }
    }
  `;

  const icon = (paths) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const icons = {
    grid: icon(
      '<rect x="2.75" y="2.75" width="4" height="4" rx="1" /><rect x="9.25" y="2.75" width="4" height="4" rx="1" /><rect x="2.75" y="9.25" width="4" height="4" rx="1" /><rect x="9.25" y="9.25" width="4" height="4" rx="1" />',
    ),
    check: icon('<path d="M3.5 8.5l3 3 6-7" />'),
  };

  const template = `
    <style>${css}</style>
    <div class="variants"></div>
    <div class="end"></div>
    <nav class="ui bar" popover="manual" aria-label="Variants">
      <select class="select" aria-label="Variant"></select>
      <span class="tipped">
        <button class="icon all" type="button" aria-pressed="false" aria-label="Show All" aria-keyshortcuts="A">${icons.grid}</button>
        <span class="tip" aria-hidden="true">Show All<kbd>A</kbd></span>
      </span>
      <span class="divider" aria-hidden="true"></span>
      <span class="tipped copy">
        <button class="icon pick" type="button" aria-label="Pick" aria-keyshortcuts="P">${icons.check}</button>
        <span class="tip" aria-hidden="true">Pick<kbd>P</kbd></span>
        <output class="toast"><svg class="tick" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" pathLength="1" /></svg><span class="label"></span><span class="count"></span></output>
      </span>
    </nav>
  `;

  const typing =
    "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='listbox'], [role='menu'], [role='radiogroup'], [role='slider'], [role='spinbutton'], [role='tablist']";
  const motion = matchMedia("(prefers-reduced-motion: no-preference)");
  const easeOutQuart = "cubic-bezier(0.165, 0.84, 0.44, 1)";

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

  function scrollParent(node) {
    for (
      let element = node.parentElement;
      element;
      element = element.parentElement
    ) {
      if (
        /auto|scroll|overlay/.test(getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight
      ) {
        return element;
      }
    }
    return document.scrollingElement;
  }

  class PrototypeSwitcher extends HTMLElement {
    #root = this.attachShadow({ mode: "open", slotAssignment: "manual" });
    #items = [];
    #index = 0;
    #wanted = null;
    #all = false;
    #spyPaused = false;
    #spyFrame = 0;
    #flight = null;
    #list;
    #bar;
    #select;
    #allButton;
    #pickButton;
    #toast;
    #warmTimer = 0;
    #observer = new MutationObserver((records) => {
      const changed = records.some((record) =>
        record.type === "childList"
          ? record.target === this
          : record.target.parentElement === this,
      );
      if (changed) this.#sync();
    });

    constructor() {
      super();
      this.#root.innerHTML = template;
      this.#list = this.#root.querySelector(".variants");
      this.#bar = this.#root.querySelector(".bar");
      this.#select = this.#root.querySelector(".select");
      this.#allButton = this.#root.querySelector(".all");
      this.#pickButton = this.#root.querySelector(".pick");
      this.#toast = this.#root.querySelector(".toast");

      this.#select.addEventListener("change", () =>
        this.#show(Number(this.#select.value)),
      );
      this.#allButton.addEventListener("click", () => this.#setAll(!this.#all));
      this.#pickButton.addEventListener("click", () => this.#pick());

      for (const tipped of this.#root.querySelectorAll(".tipped")) {
        tipped.addEventListener("pointerenter", () => {
          clearTimeout(this.#warmTimer);
          this.#warmTimer = setTimeout(
            () => this.#bar.toggleAttribute("data-warm", true),
            850,
          );
        });
      }
      this.#bar.addEventListener("pointerleave", () => {
        clearTimeout(this.#warmTimer);
        this.#bar.removeAttribute("data-warm");
      });
    }

    connectedCallback() {
      this.#readURL();
      this.#observer.observe(this, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-variant", "data-note"],
      });
      document.addEventListener("keydown", this.#onKey);
      document.addEventListener("scroll", this.#onScroll, {
        capture: true,
        passive: true,
      });
      for (const type of ["wheel", "touchmove", "pointerdown"]) {
        addEventListener(type, this.#resumeSpy, {
          capture: true,
          passive: true,
        });
      }
      addEventListener("popstate", this.#onPopState);
      this.#sync();
    }

    disconnectedCallback() {
      this.#observer.disconnect();
      clearTimeout(this.#warmTimer);
      document.removeEventListener("keydown", this.#onKey);
      document.removeEventListener("scroll", this.#onScroll, { capture: true });
      for (const type of ["wheel", "touchmove", "pointerdown"]) {
        removeEventListener(type, this.#resumeSpy, { capture: true });
      }
      removeEventListener("popstate", this.#onPopState);
      cancelAnimationFrame(this.#spyFrame);
    }

    #readURL() {
      const value = new URLSearchParams(location.search).get("variant");
      this.#all = value === "all";
      this.#wanted = this.#all ? null : value;
    }

    #writeURL() {
      const url = new URL(location.href);
      url.searchParams.set(
        "variant",
        this.#all ? "all" : this.#items[this.#index].slug,
      );
      history.replaceState(history.state, "", url);
    }

    #sync() {
      const elements = [...this.children].filter((element) =>
        element.hasAttribute("data-variant"),
      );
      const previous = new Map(this.#items.map((item) => [item.element, item]));
      const current = this.#items[this.#index]?.element;
      const slugs = new Set();

      this.#items = elements.map((element) => {
        const item = previous.get(element) ?? this.#createItem(element);
        previous.delete(element);
        item.label = element.dataset.variant.trim() || "Untitled";
        item.note = element.dataset.note?.trim() ?? "";
        let slug = slugify(item.label);
        for (let n = 2; slugs.has(slug); n++)
          slug = `${slugify(item.label)}-${n}`;
        slugs.add(slug);
        item.slug = slug;
        item.title.textContent = item.label;
        item.noteNode.textContent = item.note;
        item.noteNode.hidden = !item.note;
        return item;
      });
      for (const item of previous.values()) item.wrapper.remove();

      const wrappers = this.#items.map((item) => item.wrapper);
      if (
        wrappers.some(
          (wrapper, index) => this.#list.children[index] !== wrapper,
        )
      )
        this.#list.append(...wrappers);
      for (const item of this.#items) item.slot.assign(item.element);

      this.#select.replaceChildren(
        ...this.#items.map((item, index) => {
          const option = h("option", "", item.label);
          option.value = String(index);
          return option;
        }),
      );
      this.#select.title = `Variant (1–${Math.min(this.#items.length, 9)})`;

      const wanted = this.#match(this.#wanted);
      if (wanted >= 0) {
        this.#index = wanted;
        this.#wanted = null;
      } else {
        const kept = this.#items.findIndex((item) => item.element === current);
        this.#index =
          kept >= 0
            ? kept
            : Math.min(this.#index, Math.max(this.#items.length - 1, 0));
      }

      const open = this.#bar.matches(":popover-open");
      if (this.#items.length && this.isConnected && !open)
        this.#bar.showPopover();
      else if (!this.#items.length && open) this.#bar.hidePopover();
      this.#render();
    }

    #createItem(element) {
      const slot = document.createElement("slot");
      const title = h("span", "title");
      const noteNode = h("span", "note");
      const head = h("header", "ui head", title, noteNode);
      const wrapper = h("div", "variant", head, slot);
      return { element, slot, title, noteNode, head, wrapper };
    }

    #match(value) {
      if (value == null) return -1;
      const wanted = value.trim().toLowerCase();
      const number = Number(wanted);
      if (
        Number.isInteger(number) &&
        number >= 1 &&
        number <= this.#items.length
      )
        return number - 1;
      return this.#items.findIndex(
        (item) => item.slug === wanted || item.label.toLowerCase() === wanted,
      );
    }

    #render() {
      this.#list.toggleAttribute("data-all", this.#all);
      this.#items.forEach((item, index) => {
        item.wrapper.hidden = !this.#all && index !== this.#index;
        item.wrapper.toggleAttribute("data-current", index === this.#index);
        item.head.hidden = !this.#all;
      });
      this.#select.value = String(this.#index);
      this.#allButton.setAttribute("aria-pressed", String(this.#all));
    }

    #show(index) {
      if (index < 0 || index >= this.#items.length || index === this.#index)
        return;
      const direction = Math.sign(index - this.#index);
      this.#index = index;
      this.#render();
      this.#writeURL();
      const { wrapper } = this.#items[index];
      if (this.#all) {
        this.#spyPaused = true;
        wrapper.scrollIntoView({
          block: "start",
          behavior: motion.matches ? "smooth" : "instant",
        });
        return;
      }
      if (!motion.matches) return;
      this.#flight?.cancel();
      this.#flight = wrapper.animate(
        [
          { opacity: 0, translate: `${direction * 8}px 0` },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 280, easing: easeOutQuart },
      );
    }

    #setAll(all) {
      const anchor = this.#items[this.#index]?.element;
      if (all === this.#all || !anchor) return;
      const before = anchor.getBoundingClientRect().top;
      this.#all = all;
      this.#flight?.cancel();
      this.#render();
      this.#writeURL();
      this.#spyPaused = true;
      scrollParent(this).scrollBy({
        top: anchor.getBoundingClientRect().top - before,
        behavior: "instant",
      });
      if (!all || !motion.matches) return;
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      this.#items.forEach((item, index) => {
        (index === this.#index ? item.head : item.wrapper).animate(fade, {
          duration: 260,
          easing: easeOutQuart,
        });
      });
    }

    async #pick() {
      const item = this.#items[this.#index];
      if (!item) return;
      const text = `Pick ${item.label} from ${location.pathname}`;
      const tokens = Math.ceil(text.length / 4);
      const toast = this.#toast;
      const copied = await Promise.resolve()
        .then(() => navigator.clipboard.writeText(text))
        .then(
          () => true,
          () => false,
        );
      toast.toggleAttribute("data-failed", !copied);
      toast.querySelector(".label").textContent = copied
        ? "Copied"
        : "Copy Failed";
      toast.querySelector(".count").textContent =
        `~${tokens.toLocaleString()} ${tokens === 1 ? "token" : "tokens"}`;
      const button = this.#pickButton.getBoundingClientRect();
      const overflow =
        button.left +
        button.width / 2 +
        toast.offsetWidth / 2 -
        (innerWidth - 16);
      toast.style.setProperty("--nudge", `${-Math.max(0, overflow)}px`);
      toast.dataset.side = button.top < 48 ? "below" : "above";
      toast.dataset.open = "";
      toast.parentElement.dataset.toasting = "";
      clearTimeout(toast.hide);
      toast.hide = setTimeout(() => {
        delete toast.dataset.open;
        delete toast.parentElement.dataset.toasting;
      }, 1600);
    }

    #onKey = (event) => {
      this.#spyPaused = false;
      if (!this.#items.length || event.defaultPrevented || event.isComposing)
        return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;
      const target = event.composedPath()[0];
      const ownSelect = target === this.#select && !this.#isOpen(this.#select);
      if (
        !ownSelect &&
        target instanceof Element &&
        (target.closest(typing) || target.isContentEditable)
      )
        return;

      const key = event.key.toLowerCase();
      if (key === "arrowleft") this.#show(this.#index - 1);
      else if (key === "arrowright") this.#show(this.#index + 1);
      else if (/^[1-9]$/.test(key) && Number(key) <= this.#items.length)
        this.#show(Number(key) - 1);
      else if (key === "a") this.#setAll(!this.#all);
      else if (key === "p") this.#pick();
      else if (key === "escape" && this.#all) this.#setAll(false);
      else return;
      event.preventDefault();
    };

    #isOpen(select) {
      try {
        return select.matches(":open");
      } catch {
        return false;
      }
    }

    #resumeSpy = () => {
      this.#spyPaused = false;
    };

    #onScroll = (event) => {
      if (!this.#all || this.#spyPaused || this.#spyFrame) return;
      const scroller =
        event.target === document ? document.scrollingElement : event.target;
      if (!(scroller instanceof Element) || !scroller.contains(this)) return;
      this.#spyFrame = requestAnimationFrame(() => {
        this.#spyFrame = 0;
        this.#spy(scroller);
      });
    };

    #spy(scroller) {
      const line = innerHeight / 3;
      let index = 0;
      this.#items.forEach((item, i) => {
        if (item.wrapper.getBoundingClientRect().top <= line) index = i;
      });
      const last = this.#items.length - 1;
      const atEnd =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      if (
        atEnd &&
        this.#items[last].wrapper.getBoundingClientRect().top < innerHeight
      )
        index = last;
      if (index === this.#index) return;
      this.#index = index;
      this.#render();
    }

    #onPopState = () => {
      this.#readURL();
      this.#sync();
    };
  }

  customElements.define("prototype-switcher", PrototypeSwitcher);
}

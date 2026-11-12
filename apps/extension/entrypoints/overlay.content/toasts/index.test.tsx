/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createOverlayStore } from "../store";
import { Toasts } from ".";
import styles from "./styles.module.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

/** A long X post title, the case that stretches the duplicate toast. */
const PAGE_TITLE = `Marcel on X: "${"here is how we made this video in code. ".repeat(12)}"`;

function rule(selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(
    start,
    `${selector} is missing from the toast stylesheet`,
  ).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start)).replace(/\s+/g, " ");
}

function className(value: string | undefined, name: string) {
  if (value === undefined) throw new Error(`Missing ${name} class`);
  return value;
}

/** Vitest does not inject CSS modules, so apply the real rule under its hashed class. */
function apply(selector: string, className: string) {
  const style = document.createElement("style");
  style.textContent = rule(selector).replace(selector, `.${className}`);
  document.head.append(style);
  return style;
}

let host: HTMLDivElement;
let root: Root;
const applied: HTMLStyleElement[] = [];

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const style of applied) style.remove();
  applied.length = 0;
});

function button(label: string) {
  return [...host.querySelectorAll("button")].find(
    (element) =>
      element.textContent?.trim() === label ||
      element.getAttribute("aria-label") === label,
  );
}

it("clamps an already-saved page title so the toast stays compact", async () => {
  const store = createOverlayStore();
  await act(async () => {
    root.render(<Toasts manager={store.toasts} container={host} />);
  });
  await act(async () => {
    store.show(
      {
        view: "toast",
        toast: {
          id: "capture-1",
          status: "duplicate",
          title: PAGE_TITLE,
          saveId: "save-1",
        },
      },
      { theme: null, mode: "light" },
    );
  });

  const heading = host.querySelector("h2");
  const description = host.querySelector("p");
  expect(heading?.textContent).toBe("Already in Pond");
  if (!(description instanceof HTMLParagraphElement)) {
    throw new Error("Missing description");
  }
  expect(description.textContent).toBe(PAGE_TITLE);

  const status = heading?.querySelector("span");
  if (!(status instanceof HTMLElement)) throw new Error("Missing status");
  const swapClass = className(styles.swap, "swap");
  const descriptionClass = className(styles.description, "description");
  expect(status.classList.contains(swapClass)).toBe(true);
  expect(description.classList.contains(swapClass)).toBe(false);
  expect(description.classList.contains(descriptionClass)).toBe(true);

  applied.push(
    apply(".swap", swapClass),
    apply(".description", descriptionClass),
  );
  expect(getComputedStyle(status).textOverflow).toBe("ellipsis");
  const descriptionStyle = getComputedStyle(description);
  expect(descriptionStyle.display).toBe("-webkit-box");
  expect(descriptionStyle.webkitBoxOrient).toBe("vertical");
  expect(descriptionStyle.overflow).toBe("hidden");
  expect(descriptionStyle.webkitLineClamp).toBe("3");

  const open = button("Open");
  const dismiss = button("Dismiss");
  if (!(open instanceof HTMLButtonElement)) throw new Error("Missing Open");
  if (!(dismiss instanceof HTMLButtonElement)) {
    throw new Error("Missing Dismiss");
  }
  expect(open.hasAttribute("disabled")).toBe(false);
  expect(dismiss.hasAttribute("disabled")).toBe(false);
  expect(description.contains(open)).toBe(false);
  expect(description.contains(dismiss)).toBe(false);
});

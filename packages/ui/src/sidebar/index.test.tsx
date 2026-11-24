/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Sidebar } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function hover(label: HTMLElement, widths: { scroll: number }) {
  Object.defineProperty(label, "scrollWidth", { value: widths.scroll });
  Object.defineProperty(label, "clientWidth", { value: 100 });
  await act(async () => {
    label.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  });
}

it("shows the full label on hover only when it is truncated", async () => {
  await act(async () =>
    root.render(
      <>
        <Sidebar.ItemLabel data-testid="long">
          Inspiration for the kitchen remodel
        </Sidebar.ItemLabel>
        <Sidebar.ItemLabel data-testid="short">Kitchen</Sidebar.ItemLabel>
      </>,
    ),
  );
  const long = host.querySelector<HTMLElement>('[data-testid="long"]');
  const short = host.querySelector<HTMLElement>('[data-testid="short"]');
  if (!long || !short) {
    throw new Error("Missing labels");
  }

  await hover(long, { scroll: 240 });
  await hover(short, { scroll: 60 });

  expect(long.title).toBe("Inspiration for the kitchen remodel");
  expect(short.hasAttribute("title")).toBe(false);
});

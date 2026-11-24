// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ViewerHud } from ".";

let host: HTMLDivElement;
let root: Root;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("renders the shared start, center, and end toolbar zones", async () => {
  await act(async () => {
    root.render(
      <ViewerHud.Bar
        label="Preview controls"
        start={<span>Count</span>}
        center={<span>View</span>}
        end={<button type="button">Action</button>}
      />,
    );
  });

  const toolbar = host.querySelector('[role="toolbar"]');
  expect(toolbar?.getAttribute("aria-label")).toBe("Preview controls");
  expect(
    toolbar?.querySelector('[data-viewer-bar-slot="start"]')?.textContent,
  ).toBe("Count");
  expect(
    toolbar?.querySelector('[data-viewer-bar-slot="center"]')?.textContent,
  ).toBe("View");
  expect(
    toolbar?.querySelector('[data-viewer-bar-slot="end"]')?.textContent,
  ).toBe("Action");
});

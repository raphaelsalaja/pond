import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SettingsSidebarView } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("renders the settings search", async () => {
  await act(async () => {
    root.render(<SettingsSidebarView activeSection="general" />);
  });

  expect(host.querySelector('[aria-label="Search Settings"]')).not.toBeNull();
});

it("highlights Sources while a source page is open", async () => {
  await act(async () => {
    root.render(<SettingsSidebarView activeSection="sources-youtube" />);
  });

  const current = host.querySelector('[aria-current="page"]');

  expect(current?.textContent).toBe("Sources");
  expect(host.textContent).not.toContain("YouTube");
});

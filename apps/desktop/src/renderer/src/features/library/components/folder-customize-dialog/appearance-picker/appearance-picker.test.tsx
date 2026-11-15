import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppearancePicker } from ".";

let host: HTMLDivElement;
let root: Root;
const onIconChange = vi.fn();
const onColorChange = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("pond", {
    query: vi.fn(async (name: string) =>
      name === "settings.getPrefs"
        ? {
            folderAppearance: {
              recentIcons: ["heart"],
              recentColors: ["#336699", "pink"],
            },
          }
        : { ok: true },
    ),
  });
  onIconChange.mockReset();
  onColorChange.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function open(): Promise<void> {
  await act(async () => {
    root.render(
      <AppearancePicker
        icon="folder"
        color="#336699"
        disabled={false}
        onIconChange={onIconChange}
        onColorChange={onColorChange}
      />,
    );
  });
  await act(async () => button(document, "Icon and Color").click());
}

function button(scope: ParentNode, label: string): HTMLButtonElement {
  const match = scope.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

function section(label: string): HTMLElement | null {
  return document.querySelector(`section[aria-label="${label}"]`);
}

function field(label: string): HTMLInputElement {
  const match = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!match) throw new Error(`Missing field: ${label}`);
  return match;
}

function type(input: HTMLInputElement, value: string): Promise<void> {
  return act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
}

it("shows recently used icons and colors", async () => {
  await open();
  const icons = section("Recently Used Icons");
  if (!icons) throw new Error("Missing recent icons");
  expect(button(icons, "Heart")).toBeDefined();
  const colors = section("Recently Used Colors");
  if (!colors) throw new Error("Missing recent colors");
  const custom = button(colors, "#336699");
  expect(custom.getAttribute("aria-pressed")).toBe("true");
  await act(async () => button(colors, "Pink").click());
  expect(onColorChange).toHaveBeenCalledWith("pink");
});

it("searches icons by keyword and picks the first result on Enter", async () => {
  await open();
  const search = field("Search Icons");
  await type(search, "photos");
  expect(section("Recently Used Icons")).toBeNull();
  const results = section("Icons");
  if (!results) throw new Error("Missing icon results");
  expect(
    [...results.querySelectorAll("button")].map((entry) =>
      entry.getAttribute("aria-label"),
    ),
  ).toEqual(["Album"]);
  await act(async () => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onIconChange).toHaveBeenCalledWith("album");
});

it("says when no icon matches", async () => {
  await open();
  await type(field("Search Icons"), "zzzz");
  const statuses = [...document.querySelectorAll('[role="status"]')];
  expect(statuses.map((status) => status.textContent).join(" ")).toContain(
    "No results found",
  );
  expect(section("Icons")).toBeNull();
});

it("applies a custom hex color", async () => {
  await open();
  await type(field("Custom Color hex"), "#AB12CD");
  expect(onColorChange).toHaveBeenCalledWith("#ab12cd");
});

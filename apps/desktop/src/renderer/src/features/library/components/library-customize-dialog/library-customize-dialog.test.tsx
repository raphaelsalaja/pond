import type { LibraryMarkSource } from "@shared/library-mark";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LibraryCustomizeDialog } from ".";

const LOGO = "data:image/png;base64,bG9nbw==";
const POND_LOGO = "data:image/png;base64,cG9uZA==";
const SOURCE = "data:image/png;base64,c291cmNl";

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

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
    query: vi.fn(async (name: string) => {
      if (name === "library.identity.pickIcon") {
        return { ok: true, image: { src: SOURCE, width: 400, height: 200 } };
      }
      if (name === "library.identity.cropIcon") return { ok: true, icon: LOGO };
      if (name === "library.identity.pondLogo") {
        return { ok: true, icon: POND_LOGO };
      }
      return { ok: true };
    }),
  });
  onClose.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(mark: LibraryMarkSource | null = null): Promise<void> {
  const client = new QueryClient();
  return act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <LibraryCustomizeDialog
          library={{
            path: "/Users/rafa/Memes.pond",
            name: "Memes",
            icon: mark ? LOGO : null,
            mark,
          }}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
  });
}

function menuItem(label: string): HTMLElement {
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (entry) => entry.textContent?.includes(label),
  );
  if (!(item instanceof HTMLElement)) throw new Error(`Missing ${label}`);
  return item;
}

async function openLogoMenu(): Promise<void> {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Edit Logo"]',
  );
  if (!trigger) throw new Error("Missing Edit Logo trigger");
  await act(async () => trigger.click());
}

function save(): Promise<void> {
  return act(async () =>
    [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.trim() === "Save")
      ?.click(),
  );
}

it("offers emoji, icon, and image logos", async () => {
  await render();
  await openLogoMenu();
  for (const label of [
    "Choose Pond Logo",
    "Choose Emoji",
    "Choose Icon",
    "Upload Image",
  ]) {
    expect(menuItem(label)).toBeDefined();
  }
  expect(document.body.textContent).not.toContain("Reset Logo");
});

function pondTint(label: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `[aria-label="Choose Pond Logo"] button[aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Missing ${label}`);
  return button;
}

it("saves a Pond logo tint as the library logo", async () => {
  await render();
  await openLogoMenu();
  await act(async () => menuItem("Choose Pond Logo").click());
  await vi.waitFor(() =>
    expect(pondTint("Aqua").getAttribute("aria-pressed")).toBe("true"),
  );
  await act(async () => pondTint("Grape").click());
  expect(document.querySelector('[data-mark="pond:grape"]')).not.toBeNull();
  expect(document.querySelector('[role="radiogroup"]')).toBeNull();
  await save();
  expect(window.pond.query).toHaveBeenCalledWith("library.identity.pondLogo", {
    tint: "grape",
  });
  expect(window.pond.query).toHaveBeenCalledWith("library.identity.update", {
    icon: POND_LOGO,
    mark: { kind: "pond", tint: "grape" },
  });
});

it("restores the original logo from the Pond logo picker", async () => {
  await render({ kind: "pond", tint: "grape" });
  expect(document.querySelector('[data-mark="pond:grape"]')).not.toBeNull();
  await openLogoMenu();
  await act(async () => menuItem("Choose Pond Logo").click());
  await vi.waitFor(() =>
    expect(pondTint("Grape").getAttribute("aria-pressed")).toBe("true"),
  );
  await act(async () => pondTint("Aqua").click());
  await save();
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "library.identity.pondLogo",
    expect.anything(),
  );
  expect(window.pond.query).toHaveBeenCalledWith("library.identity.update", {
    icon: null,
    mark: null,
  });
});

it("starts icon logos on the Pond mark", async () => {
  await render();
  await openLogoMenu();
  await act(async () => menuItem("Choose Icon").click());
  await vi.waitFor(() =>
    expect(
      document
        .querySelector('button[aria-label="Pond"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true"),
  );
  expect(document.querySelector('button[aria-label="Folder"]')).toBeNull();
});

it("shows colors only for emoji and icon logos", async () => {
  await render();
  expect(document.querySelector('[role="radiogroup"]')).toBeNull();
  await openLogoMenu();
  await act(async () => menuItem("Choose Icon").click());
  await vi.waitFor(() =>
    expect(
      document
        .querySelector('[role="radio"][aria-label="Blue"]')
        ?.getAttribute("aria-checked"),
    ).toBe("true"),
  );
  expect(
    document.querySelectorAll('[role="radiogroup"] [role="radio"]').length,
  ).toBeGreaterThanOrEqual(30);
  expect(
    document.querySelector('[role="radio"][aria-label="Bright Blue"]'),
  ).not.toBeNull();
});

it("reopens a saved icon logo with its color", async () => {
  await render({ kind: "icon", icon: "rocket", color: "teal-bright" });
  expect(
    document
      .querySelector('[role="radio"][aria-label="Bright Teal"]')
      ?.getAttribute("aria-checked"),
  ).toBe("true");
  expect(document.querySelector('[data-mark="icon:rocket"]')).not.toBeNull();
});

it("reopens a mark with a retired shade on its hue", async () => {
  await render({ kind: "emoji", emoji: "🐳", color: "navy-deep" });
  expect(
    document
      .querySelector('[role="radio"][aria-label="Navy"]')
      ?.getAttribute("aria-checked"),
  ).toBe("true");
});

function cropDialog(): HTMLElement {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(
    (entry) => entry.textContent?.includes("Crop Logo"),
  );
  if (!(dialog instanceof HTMLElement)) throw new Error("Missing Crop Logo");
  return dialog;
}

function cropButton(label: string): HTMLButtonElement {
  const button = [...cropDialog().querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Missing ${label}`);
  return button;
}

async function uploadImage(): Promise<void> {
  await openLogoMenu();
  await act(async () => menuItem("Upload Image").click());
  await vi.waitFor(() => expect(cropDialog()).toBeDefined());
}

it("crops an uploaded image before saving it as the library logo", async () => {
  await render();
  await uploadImage();
  await act(async () => cropButton("Crop").click());
  expect(window.pond.query).toHaveBeenCalledWith("library.identity.cropIcon", {
    src: SOURCE,
    crop: { x: 100, y: 0, size: 200 },
  });
  await vi.waitFor(() =>
    expect(document.querySelector(`img[src="${LOGO}"]`)).not.toBeNull(),
  );
  await save();
  expect(window.pond.query).toHaveBeenCalledWith("library.identity.update", {
    icon: LOGO,
    mark: null,
  });
  expect(onClose).toHaveBeenCalled();
});

it("moves the crop with the arrow keys", async () => {
  await render();
  await uploadImage();
  const viewport = cropDialog().querySelector<HTMLElement>(
    '[role="application"]',
  );
  if (!viewport) throw new Error("Missing crop area");
  await act(async () =>
    viewport.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  await act(async () => cropButton("Crop").click());
  expect(window.pond.query).toHaveBeenCalledWith("library.identity.cropIcon", {
    src: SOURCE,
    crop: { x: expect.closeTo(100 - (8 * 200) / 224, 5), y: 0, size: 200 },
  });
});

it("keeps the current logo when the crop is cancelled", async () => {
  await render();
  await uploadImage();
  await act(async () => cropButton("Cancel").click());
  await vi.waitFor(() =>
    expect(
      [...document.querySelectorAll('[role="dialog"]')].some((entry) =>
        entry.textContent?.includes("Crop Logo"),
      ),
    ).toBe(false),
  );
  expect(window.pond.query).not.toHaveBeenCalledWith(
    "library.identity.cropIcon",
    expect.anything(),
  );
  expect(document.querySelector(`img[src="${LOGO}"]`)).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

it("renames the library bundle when the name changes", async () => {
  await render();
  const input = document.querySelector<HTMLInputElement>(
    'input[maxlength="255"]',
  );
  if (!input) throw new Error("Missing name field");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "Work");
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await save();
  expect(window.pond.query).toHaveBeenCalledWith("library.rename", {
    name: "Work",
  });
});

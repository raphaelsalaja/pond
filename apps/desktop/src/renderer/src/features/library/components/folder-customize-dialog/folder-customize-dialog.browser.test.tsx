import { PrefsSchema } from "@pond/schema";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { FolderCustomizeDialog } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  bridge.use({
    query: {
      "folders.metadata.get": ({ folderId }) => ({
        folderId,
        description: null,
        externalLink: null,
      }),
      "folders.rename": () => ({ ok: true }),
      "folders.list": () => [],
      "folders.memberships": () => [],
      "settings.getPrefs": () => PrefsSchema.parse({}),
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function render(): Promise<void> {
  return act(async () => {
    root.render(
      <FolderCustomizeDialog
        folder={{ id: "folder", name: "Folder", color: null }}
        onClose={() => {}}
      />,
    );
  });
}

function button(label: string): HTMLButtonElement {
  const match = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!match) {
    throw new Error(`Missing button: ${label}`);
  }
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

it("shows folder details and presentation controls", async () => {
  await render();
  expect(document.body.textContent).toContain("Name");
  expect(document.body.textContent).toContain("Description");
  expect(document.body.textContent).not.toContain("External Link");
  expect(button("Icon and Color")).toBeDefined();
  expect(document.querySelector('input[type="password"]')).toBeNull();
});

it("renames the folder when the name changes", async () => {
  await render();
  const name = document.querySelector<HTMLInputElement>(
    'input[maxlength="255"]',
  );
  if (!name) {
    throw new Error("Missing name field");
  }
  await type(name, "References");
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((candidate) => candidate.textContent?.trim() === "Save")
      ?.click(),
  );
  expect(window.pond.query).toHaveBeenCalledWith("folders.rename", {
    id: "folder",
    name: "References",
  });
});

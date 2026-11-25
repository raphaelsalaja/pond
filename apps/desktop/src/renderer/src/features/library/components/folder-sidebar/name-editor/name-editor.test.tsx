import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FolderNameEditor } from "./";

let root: Root;
let container: HTMLDivElement;
let saved: Array<string>;
let saveError: Error | null;
async function onSave(name: string): Promise<void> {
  saved.push(name);
  const error = saveError;
  saveError = null;
  if (error) {
    throw error;
  }
}
const onFinish = vi.fn();
beforeEach(async () => {
  saved = [];
  saveError = null;
  onFinish.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <FolderNameEditor name="Untitled" onSave={onSave} onFinish={onFinish} />,
    );
  });
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});
function field() {
  const input = container.querySelector("input");
  if (!input) throw new Error("Missing folder name editor");
  return input;
}
async function press(key: string) {
  await act(() =>
    field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
  );
}
async function blur() {
  await act(async () => {
    field().blur();
  });
}
it("focuses and selects the new folder name", () => {
  expect(document.activeElement).toBe(field());
  expect(field().selectionStart).toBe(0);
  expect(field().selectionEnd).toBe("Untitled".length);
});
it("saves the trimmed name once on Enter followed by blur", async () => {
  field().value = "  Travel  ";
  await press("Enter");
  await blur();
  expect(saved).toEqual(["Travel"]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("saves when focus leaves the editor", async () => {
  field().value = "Recipes";
  await blur();
  expect(saved).toEqual(["Recipes"]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps Untitled on Escape or empty input", async () => {
  field().value = "Changed";
  await press("Escape");
  await blur();
  expect(saved).toEqual([]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps the existing name when the input is empty", async () => {
  field().value = "   ";
  await press("Enter");
  expect(saved).toEqual([]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps the editor available after a failed rename", async () => {
  saveError = new Error("offline");
  field().value = "Travel";
  await press("Enter");
  expect(onFinish).not.toHaveBeenCalled();
  expect(field().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(field());
  await press("Enter");
  expect(onFinish).toHaveBeenCalledOnce();
});

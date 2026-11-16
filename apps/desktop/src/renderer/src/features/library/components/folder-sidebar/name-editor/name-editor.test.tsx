import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FolderNameEditor } from "./";

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "styles.module.css"),
  "utf8",
);

let root: Root;
let container: HTMLDivElement;
const onSave = vi.fn(async (_name: string) => {});
const onFinish = vi.fn();
beforeEach(async () => {
  onSave.mockReset();
  onFinish.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <FolderNameEditor name="Untitled" onSave={onSave} onFinish={onFinish} />,
    ),
  );
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
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
it("focuses and selects the new folder name", () => {
  expect(document.activeElement).toBe(field());
  expect(field().selectionStart).toBe(0);
  expect(field().selectionEnd).toBe("Untitled".length);
});
it("matches the normal row's icon-to-name spacing while editing", () => {
  expect(css).toMatch(/\.icon\s*\{[^}]*margin-right:\s*var\(--ds-space-md\);/s);
  expect(css).toMatch(/\.field\s*\{[^}]*padding-inline:\s*0;/s);
});
it("saves the trimmed name once on Enter followed by blur", async () => {
  field().value = "  Travel  ";
  await press("Enter");
  await act(() => field().blur());
  expect(onSave).toHaveBeenCalledExactlyOnceWith("Travel");
  expect(onFinish).toHaveBeenCalledOnce();
});
it("saves when focus leaves the editor", async () => {
  field().value = "Recipes";
  await act(() => field().blur());
  expect(onSave).toHaveBeenCalledExactlyOnceWith("Recipes");
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps Untitled on Escape or empty input", async () => {
  field().value = "Changed";
  await press("Escape");
  await act(() => field().blur());
  expect(onSave).not.toHaveBeenCalled();
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps the existing name when the input is empty", async () => {
  field().value = "   ";
  await press("Enter");
  expect(onSave).not.toHaveBeenCalled();
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps the editor available after a failed rename", async () => {
  onSave.mockRejectedValueOnce(new Error("offline"));
  field().value = "Travel";
  await press("Enter");
  expect(onFinish).not.toHaveBeenCalled();
  expect(field().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(field());
  await press("Enter");
  expect(onFinish).toHaveBeenCalledOnce();
});

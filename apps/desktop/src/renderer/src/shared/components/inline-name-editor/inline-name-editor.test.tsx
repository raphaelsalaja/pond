import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InlineNameEditor } from "./index";

let root: Root;
let container: HTMLDivElement;
const saved: Array<string> = [];
let failNextSave = false;
const onFinish = vi.fn();

async function onSave(name: string): Promise<void> {
  saved.push(name);
  if (failNextSave) {
    failNextSave = false;
    throw new Error("offline");
  }
}

beforeEach(async () => {
  saved.length = 0;
  failNextSave = false;
  onFinish.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <InlineNameEditor
        name="Untitled"
        ariaLabel="Name"
        onSave={onSave}
        onFinish={onFinish}
      />,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function field() {
  const input = container.querySelector("input");
  if (!input) throw new Error("Missing inline name editor");
  return input;
}
async function press(key: string, isComposing = false) {
  await act(() =>
    field().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, isComposing }),
    ),
  );
}
it("focuses and selects the current name", () => {
  expect(document.activeElement).toBe(field());
  expect(field().selectionStart).toBe(0);
  expect(field().selectionEnd).toBe("Untitled".length);
});
it("saves the trimmed name once on Enter followed by blur", async () => {
  field().value = "  Travel  ";
  await press("Enter");
  await act(async () => field().blur());
  expect(saved).toEqual(["Travel"]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("saves when focus leaves the editor", async () => {
  field().value = "Recipes";
  await act(async () => field().blur());
  expect(saved).toEqual(["Recipes"]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps the current name on Escape", async () => {
  field().value = "Changed";
  await press("Escape");
  await act(async () => field().blur());
  expect(saved).toEqual([]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("does not commit Enter while text is composing", async () => {
  field().value = "旅行";
  await press("Enter", true);
  expect(saved).toEqual([]);
  expect(onFinish).not.toHaveBeenCalled();
});
it("keeps the existing name when the input is empty", async () => {
  field().value = "   ";
  await press("Enter");
  expect(saved).toEqual([]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("cancels an empty create instead of keeping a blank name", async () => {
  await act(async () =>
    root.render(
      <InlineNameEditor
        name=""
        ariaLabel="Name"
        empty="cancel"
        onSave={onSave}
        onFinish={onFinish}
      />,
    ),
  );
  field().value = "   ";
  await press("Enter");
  expect(saved).toEqual([]);
  expect(onFinish).toHaveBeenCalledOnce();
});
it("keeps the editor available after a failed save", async () => {
  failNextSave = true;
  field().value = "Travel";
  await press("Enter");
  expect(onFinish).not.toHaveBeenCalled();
  expect(field().getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(field());
  await press("Enter");
  expect(onFinish).toHaveBeenCalledOnce();
});

import { afterEach, expect, it } from "vitest";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { collectionOwnsKeyboard, saveOwnsKeyboard } from "./keyboard-owner";

const nodes: HTMLElement[] = [];
function surface(attribute: string, value = "") {
  const node = document.createElement("div");
  node.setAttribute(attribute, value);
  node.tabIndex = 0;
  document.body.append(node);
  nodes.push(node);
  node.focus();
  return node;
}
const key = () => new KeyboardEvent("keydown", { key: "Backspace" });
afterEach(() => {
  for (const node of nodes) node.remove();
  nodes.length = 0;
  selection.clear();
  primarySelection.set(null);
});

it("limits collection commands to its own focused surface", () => {
  surface("data-save-collection");
  expect(collectionOwnsKeyboard()).toBe(true);
  expect(saveOwnsKeyboard(key())).toBe(true);
  surface("data-sidebar");
  expect(collectionOwnsKeyboard()).toBe(false);
  expect(saveOwnsKeyboard(key())).toBe(false);
});

it("keeps collection and Save keys working while a toast is showing", () => {
  const toast = document.createElement("div");
  toast.setAttribute("role", "dialog");
  toast.setAttribute("aria-modal", "false");
  document.body.append(toast);
  nodes.push(toast);
  surface("data-save-collection");
  expect(collectionOwnsKeyboard()).toBe(true);
  expect(saveOwnsKeyboard(key())).toBe(true);
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  document.body.append(dialog);
  nodes.push(dialog);
  expect(collectionOwnsKeyboard()).toBe(false);
  expect(saveOwnsKeyboard(key())).toBe(false);
});

it("keeps the inspector bound to the displayed Save rather than a background batch", () => {
  primarySelection.set("a");
  selection.set(["a"]);
  surface("data-save-inspector", "a");
  expect(saveOwnsKeyboard(key())).toBe(true);
  selection.set(["a", "b"]);
  expect(saveOwnsKeyboard(key())).toBe(false);
  selection.set(["b"]);
  primarySelection.set("b");
  expect(saveOwnsKeyboard(key())).toBe(false);
});

it("keeps the open save in charge after the focused control unmounts", () => {
  const button = document.createElement("button");
  document.body.append(button);
  button.focus();
  button.remove();
  expect(document.activeElement).toBe(document.body);
  expect(saveOwnsKeyboard(key())).toBe(false);
  const details = surface("data-save-details");
  details.blur();
  expect(document.activeElement).toBe(document.body);
  expect(saveOwnsKeyboard(key())).toBe(true);
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  document.body.append(menu);
  nodes.push(menu);
  expect(saveOwnsKeyboard(key())).toBe(false);
});

it("lets a preview own Save commands while ordinary dialogs and text editors block them", () => {
  const dialog = surface("role", "dialog");
  dialog.setAttribute("data-quick-preview", "");
  expect(saveOwnsKeyboard(key())).toBe(true);
  const field = document.createElement("input");
  dialog.append(field);
  field.focus();
  expect(saveOwnsKeyboard(key())).toBe(false);
  dialog.focus();
  dialog.removeAttribute("data-quick-preview");
  expect(saveOwnsKeyboard(key())).toBe(false);
});

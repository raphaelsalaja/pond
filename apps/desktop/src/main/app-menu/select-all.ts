import type { WebContents } from "electron";

const FOCUSED_TEXT_FIELD = `(() => {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement)
    return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(el.type);
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
})()`;

/** macOS fires the menu's Mod+A even after the page handles it, so outside a text field it would highlight every label. */
export async function selectAllInTextField(
  contents: Pick<WebContents, "executeJavaScript" | "selectAll">,
): Promise<void> {
  const editable: unknown = await contents
    .executeJavaScript(FOCUSED_TEXT_FIELD)
    .catch(() => false);
  if (editable === true) contents.selectAll();
}

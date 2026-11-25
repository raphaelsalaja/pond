import type { ToolbarAction } from "@/utils/types";

/** An empty popup makes the browser fire `action.onClicked`, which saves in one click. */
export async function applyToolbarAction(action: ToolbarAction): Promise<void> {
  if (!browser.action) return;
  await browser.action
    .setPopup({ popup: action === "popup" ? "popup.html" : "" })
    .catch(() => {});
  await browser.action
    .setTitle({
      title: action === "popup" ? "Pond" : "Save to Pond",
    })
    .catch(() => {});
}

/** Save Page is one click. Ask Where to Save still covers the panel, menus, and gestures. */
export function toolbarSkipsDetails(action: ToolbarAction): boolean {
  return action === "save";
}

/** Ignores a settings read that finished after a newer one, so wake cannot put the popup back. */
export function createToolbarApply(input: {
  read: () => Promise<ToolbarAction>;
  apply: (action: ToolbarAction) => Promise<void>;
}): () => Promise<void> {
  let generation = 0;
  return async () => {
    const ticket = ++generation;
    const action = await input.read();
    if (ticket !== generation) return;
    await input.apply(action);
  };
}

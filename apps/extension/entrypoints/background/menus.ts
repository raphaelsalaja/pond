import { contextMenus } from "@/utils/menus-api";
import type { CaptureTool } from "@/utils/messaging";
import { linkDraft, mediaDraft, offerDraft } from "./capture";
import { runTool } from "./tools";

type MenuContexts = NonNullable<
  Parameters<typeof contextMenus.create>[0]["contexts"]
>;

const PAGE_CONTEXTS: MenuContexts = [
  "page",
  "selection",
  "image",
  "link",
  "video",
  "audio",
];

const TOOL_MENUS = new Map<string, { tool: CaptureTool; title: string }>([
  ["pond-images", { tool: "images", title: "Save Images" }],
  ["pond-region", { tool: "region", title: "Capture Region" }],
  ["pond-visible", { tool: "visible", title: "Capture Visible Area" }],
  ["pond-full-page", { tool: "full", title: "Capture Full Page" }],
]);

const COMMAND_TOOLS = new Map<string, CaptureTool>([
  ["save-page", "page"],
  ["save-images", "images"],
  ["screenshot-region", "region"],
  ["screenshot-visible", "visible"],
  ["screenshot-full", "full"],
]);

export function createMenus(): void {
  void contextMenus.removeAll().then(() => {
    contextMenus.create({
      id: "pond-save",
      title: "Save Page",
      contexts: ["page", "selection"],
    });
    contextMenus.create({
      id: "pond-save-link",
      title: "Save Link",
      contexts: ["link"],
    });
    contextMenus.create({
      id: "pond-save-media",
      title: "Save Image",
      contexts: ["image"],
    });
    contextMenus.create({
      id: "pond-save-video",
      title: "Save Video",
      contexts: ["video", "audio"],
    });
    contextMenus.create({
      id: "pond-separator",
      type: "separator",
      contexts: PAGE_CONTEXTS,
    });
    for (const [id, { title }] of TOOL_MENUS) {
      contextMenus.create({ id, title, contexts: PAGE_CONTEXTS });
    }
  });
}

export function handleMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): void {
  const id = String(info.menuItemId);
  const menu = TOOL_MENUS.get(id);
  if (menu && tab) {
    void runTool(tab, menu.tool);
    return;
  }
  if (id === "pond-save-link") {
    void offerDraft(
      linkDraft(info.linkUrl, info.selectionText, "context-menu"),
      tab?.id,
    );
    return;
  }
  if (id === "pond-save-media" || id === "pond-save-video") {
    void offerDraft(mediaDraft(info.srcUrl, tab, "context-menu"), tab?.id);
    return;
  }
  if (id === "pond-save" && tab) void runTool(tab, "page");
}

export async function handleCommand(command: string): Promise<void> {
  const tool = COMMAND_TOOLS.get(command);
  if (!tool) return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) await runTool(tab, tool);
}

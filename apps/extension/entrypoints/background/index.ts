import { z } from "zod";
import { onMessage } from "@/utils/messaging";
import { ensureSettings, getSettings, watchSettings } from "@/utils/settings";
import { saveFromSite } from "./capture";
import { probeLibrary } from "./library";
import { createMenus, handleCommand, handleMenuClick } from "./menus";
import { clearBadge, flashBadge } from "./overlay";
import { startSessionConnect } from "./session";
import { syncSettings } from "./settings";
import { applyToolbarAction, createToolbarApply } from "./toolbar";
import { handleGesture, handleOverlayResult, runTool } from "./tools";

const pondPathSchema = z
  .string()
  .regex(/^(?:item|folder|search|settings)(?:\/[\w-]+)*$/)
  .optional();

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    await ensureSettings();
    clearBadge();
    createMenus();
  });
  browser.runtime.onStartup.addListener(clearBadge);

  const applyCurrentToolbar = createToolbarApply({
    read: async () => (await getSettings()).toolbar,
    apply: applyToolbarAction,
  });
  void syncSettings().finally(() => void applyCurrentToolbar());
  watchSettings(() => void applyCurrentToolbar());

  browser.action?.onClicked.addListener((tab) => {
    void runTool(tab, "page");
  });
  browser.contextMenus.onClicked.addListener(handleMenuClick);
  browser.commands?.onCommand.addListener((command) => {
    void handleCommand(command);
  });

  onMessage("log", ({ data }) => {
    const fn =
      data.level === "error"
        ? console.error
        : data.level === "warn"
          ? console.warn
          : console.info;
    fn("[pond]", data.message, data.data);
  });

  onMessage("capture", ({ data, sender }) =>
    saveFromSite(data.url, data.trigger, sender.tab?.id),
  );

  onMessage("runTool", async ({ data }) => {
    const tab = await browser.tabs.get(data.tabId);
    return runTool(tab, data.tool);
  });

  onMessage("overlayResult", ({ data, sender }) =>
    handleOverlayResult(data, sender.tab),
  );

  onMessage("gesture", ({ data, sender }) => handleGesture(data, sender.tab));
  onMessage("probe", () => probeLibrary());

  onMessage("openPond", async ({ data }) => {
    const path = pondPathSchema.safeParse(data);
    if (!path.success) return false;
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = `pond://${path.data ?? ""}`;
    try {
      if (tab?.id !== undefined) await browser.tabs.update(tab.id, { url });
      else await browser.tabs.create({ url });
      return true;
    } catch (err) {
      console.error("[pond] openPond failed", err);
      return false;
    }
  });

  startSessionConnect(() => flashBadge(undefined, "saved"));
});

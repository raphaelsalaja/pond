import { CaptureWebItemSchema } from "@pond/schema/capture";
import { z } from "zod";
import type {
  CaptureRegion,
  CaptureTool,
  Gesture,
  OverlayResult,
  PageItem,
  ToolResult,
} from "@/utils/messaging";
import { getSettings } from "@/utils/settings";
import {
  isWebUrl,
  linkDraft,
  mediaDraft,
  offerDraft,
  pageDraft,
  saveDraft,
  screenshotDraft,
  submitCapture,
} from "./capture";
import { libraryTargets } from "./library";
import { announce, hideOverlay, showOverlay } from "./overlay";
import {
  captureFullPage,
  captureRegion,
  captureVisible,
  type Screenshot,
  ScreenshotError,
  type ScreenshotOptions,
} from "./screenshot";
import { cookiesForUrl } from "./session";
import { syncSettings } from "./settings";
import { toolbarSkipsDetails } from "./toolbar";

const BLOCKED = "Pond can't capture this page. Try a regular web page.";

async function failOnPage(tab: chrome.tabs.Tab, message: string) {
  await announce(tab.id, {
    id: crypto.randomUUID(),
    status: "failed",
    title: tab.title || "Screenshot",
    message,
  });
}

async function screenshot(
  tab: chrome.tabs.Tab,
  take: (options: ScreenshotOptions) => Promise<Screenshot>,
) {
  try {
    const { screenshotFormat, retina } = await getSettings();
    const { dataUrl, ...size } = await take({
      format: screenshotFormat,
      retina,
    });
    await offerDraft(screenshotDraft(tab, dataUrl, size), tab.id);
  } catch (error) {
    await failOnPage(
      tab,
      error instanceof ScreenshotError ? error.message : BLOCKED,
    );
  }
}

/** Starts a capture tool; picks finish later through `overlayResult`. */
export async function runTool(
  tab: chrome.tabs.Tab,
  tool: CaptureTool,
): Promise<ToolResult> {
  if (tab.id === undefined || tab.windowId === undefined) {
    return { ok: false, message: BLOCKED };
  }
  const { id: tabId, windowId } = tab;
  await syncSettings();
  if (tool === "page") {
    const draft = pageDraft(tab);
    if (!draft) return { ok: false, message: "Pond can only save web pages." };
    const { toolbar } = await getSettings();
    if (toolbarSkipsDetails(toolbar)) void saveDraft(draft, tabId);
    else void offerDraft(draft, tabId);
    return { ok: true };
  }
  if (tool === "region") {
    const shown = await showOverlay(tabId, { view: "region" });
    return shown ? { ok: true } : { ok: false, message: BLOCKED };
  }
  if (tool === "images") {
    const shown = await showOverlay(tabId, {
      view: "images",
      library: await libraryTargets(),
    });
    return shown ? { ok: true } : { ok: false, message: BLOCKED };
  }
  void (async () => {
    await hideOverlay(tabId);
    await screenshot(tab, (options) =>
      tool === "full"
        ? captureFullPage(tabId, windowId, options)
        : captureVisible(tabId, windowId, options),
    );
  })();
  return { ok: true };
}

async function saveRegion(tab: chrome.tabs.Tab, region: CaptureRegion) {
  const { id: tabId, windowId } = tab;
  if (tabId === undefined || windowId === undefined) return;
  await screenshot(tab, (options) =>
    captureRegion(tabId, windowId, region, options),
  );
}

const detailsSchema = z.object({
  draft: z.object({
    kind: z.enum(["page", "link", "media", "screenshot"]),
    items: z.array(CaptureWebItemSchema).min(1).max(500),
    title: z.string().max(1000),
    url: z.string().max(10_000),
    originUrl: z.url().optional(),
    trigger: z.string().max(64).optional(),
    preview: z.null().catch(null),
  }),
  metadata: z.object({
    title: z.string().max(1000),
    notes: z.string().max(100_000),
    rating: z.number().int().min(0).max(5),
    tags: z.array(z.string().trim().min(1).max(200)).max(200),
    folderIds: z.array(z.string().min(1)).max(200),
    fishId: z
      .string()
      .regex(/^[a-z0-9-]{1,64}$/)
      .nullable()
      .catch(null),
  }),
});

function draftFromItem(item: PageItem, tab: chrome.tabs.Tab) {
  return item.kind === "link"
    ? linkDraft(item.url, item.title, "alt-click")
    : mediaDraft(item.url, tab, "alt-click", item.title);
}

export async function handleOverlayResult(
  result: OverlayResult,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (!tab) return;
  if (result.kind === "region") {
    await saveRegion(tab, result.region);
    return;
  }
  if (result.kind === "details") {
    const parsed = detailsSchema.safeParse(result);
    if (!parsed.success) return;
    const { draft, metadata } = parsed.data;
    await saveDraft(
      { ...draft, preview: null },
      tab.id,
      {
        title: metadata.title.trim() || undefined,
        notes: metadata.notes.trim() || undefined,
        rating: metadata.rating > 0 ? metadata.rating : undefined,
        tags: metadata.tags,
        folderIds: metadata.folderIds,
      },
      metadata.fishId ?? undefined,
    );
    return;
  }
  const pageUrl = isWebUrl(tab.url) ? tab.url : undefined;
  const urls = result.urls.filter((url) => isWebUrl(url));
  if (urls.length === 0) return;
  await submitCapture({
    items: urls.map((url) => ({ kind: "asset", url })),
    title:
      urls.length === 1
        ? tab.title || "Image"
        : `${urls.length} images from ${tab.title || "this page"}`,
    trigger: "images",
    metadata: { tags: result.tags, folderIds: result.folderIds },
    originUrl: pageUrl,
    cookies: pageUrl ? await cookiesForUrl(pageUrl) : undefined,
    announceTab: tab.id,
  });
}

export async function handleGesture(
  gesture: Gesture,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  if (tab?.id === undefined) return;
  await syncSettings();
  if (!(await getSettings()).altClick) return;
  await offerDraft(draftFromItem(gesture.item, tab), tab.id);
}

import type { CaptureMetadata, CaptureWebDraft } from "@pond/schema/capture";
import type { ExtensionCookie } from "@pond/schema/session";
import { hostToSource, sourceLabel } from "@pond/schema/source-ids";
import { allowsSiteCapture } from "@/utils/hook-capture";
import type { DetailsDraft, DetailsPreview } from "@/utils/messaging";
import { nativeCall } from "@/utils/native";
import {
  type CaptureOutcome,
  isSettled,
  outcomeFromResponse,
} from "@/utils/outcome";
import type { OverlayToast } from "@/utils/overlay-messaging";
import { rememberTargets } from "@/utils/recent-targets";
import { getSettings } from "@/utils/settings";
import { libraryTargets } from "./library";
import { announce, flashBadge, showOverlay } from "./overlay";
import { cookiesForUrl } from "./session";
import { syncSettings } from "./settings";

const POLL_INTERVAL_MS = 750;
const POLL_ATTEMPTS = 20;

type Metadata = Partial<CaptureMetadata>;

export interface CaptureRequest {
  items: CaptureWebDraft["items"];
  title: string;
  trigger?: string;
  originUrl?: string;
  metadata?: Metadata;
  cookies?: ExtensionCookie[];
  fishId?: string;
  /** The tab to confirm the save on; omit when nothing should be shown. */
  announceTab?: number;
}

function toastFor(title: string, outcome: CaptureOutcome): OverlayToast {
  const toast: OverlayToast = { id: outcome.id, status: outcome.status, title };
  if (outcome.status === "failed") toast.message = outcome.message;
  if (outcome.status === "saved" || outcome.status === "duplicate") {
    toast.saveId = outcome.saveId;
    if (outcome.warning) toast.message = outcome.warning;
  }
  return toast;
}

async function pollUntilSettled(id: string): Promise<CaptureOutcome | null> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await nativeCall({ type: "capture.status", id });
    /** Pond builds without `capture.status` answer `invalid`; the save still lands. */
    if (!response.ok) return null;
    const outcome = outcomeFromResponse(id, response);
    if (isSettled(outcome)) return outcome;
  }
  return null;
}

export async function submitCapture(
  request: CaptureRequest,
): Promise<CaptureOutcome> {
  const id = crypto.randomUUID();
  const tags = request.metadata?.tags ?? [];
  const folderIds = request.metadata?.folderIds ?? [];
  const tab = request.announceTab;
  const title = request.metadata?.title || request.title;
  if (tab !== undefined) {
    void announce(tab, { id, status: "sending", title });
  }
  const response = await nativeCall({
    type: "capture.accept",
    draft: {
      id,
      trigger: request.trigger,
      originUrl: request.originUrl,
      metadata: { ...request.metadata, tags, folderIds },
      items: request.items,
    },
    cookies: request.cookies?.length ? request.cookies : undefined,
    fishId: request.fishId,
  });
  const outcome = outcomeFromResponse(id, response);
  if (outcome.status !== "failed" && outcome.status !== "offline") {
    void rememberTargets(folderIds, tags);
  }
  if (tab !== undefined) void announce(tab, toastFor(title, outcome));
  if (!isSettled(outcome)) {
    void pollUntilSettled(id).then(async (polled) => {
      /** Pond accepted the save, so without a final state it is queued, not lost. */
      const settled: CaptureOutcome = polled ?? { status: "saved", id };
      if (tab !== undefined) await announce(tab, toastFor(title, settled));
    });
  }
  return outcome;
}

export function isWebUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

function pageUrl(tab: chrome.tabs.Tab | undefined): string | undefined {
  return isWebUrl(tab?.url) ? tab.url : undefined;
}

export function pageDraft(tab: chrome.tabs.Tab): DetailsDraft | null {
  const url = pageUrl(tab);
  if (!url) return null;
  return {
    kind: "page",
    items: [{ kind: "url", url, title: tab.title || undefined }],
    title: tab.title || url,
    url,
    trigger: "action",
    preview: null,
  };
}

export function linkDraft(
  url: string | undefined,
  label: string | undefined,
  trigger: string,
): DetailsDraft | null {
  if (!isWebUrl(url)) return null;
  return {
    kind: "link",
    items: [{ kind: "url", url }],
    title: label?.trim() || url,
    url,
    trigger,
    preview: null,
  };
}

export function mediaDraft(
  url: string | undefined,
  tab: chrome.tabs.Tab | undefined,
  trigger: string,
  title?: string,
): DetailsDraft | null {
  if (!isWebUrl(url)) return null;
  return {
    kind: "media",
    items: [{ kind: "asset", url }],
    title: title?.trim() || tab?.title || url,
    url,
    originUrl: pageUrl(tab),
    trigger,
    preview: { src: url },
  };
}

export function screenshotDraft(
  tab: chrome.tabs.Tab,
  dataUrl: string,
  size: Required<Omit<DetailsPreview, "src">>,
): DetailsDraft {
  const title = tab.title || "Page screenshot";
  return {
    kind: "screenshot",
    items: [{ kind: "image", dataUrl, title }],
    title,
    url: tab.url ?? "",
    originUrl: pageUrl(tab),
    trigger: "screenshot",
    preview: { src: dataUrl, ...size },
  };
}

async function draftCookies(draft: DetailsDraft) {
  if (draft.kind === "screenshot") return undefined;
  const from = draft.kind === "media" ? draft.originUrl : draft.url;
  return from ? await cookiesForUrl(from) : undefined;
}

/** Saves a draft as is, or with what the person picked in the details window. */
export async function saveDraft(
  draft: DetailsDraft,
  tabId: number | undefined,
  metadata?: Metadata,
  fishId?: string,
): Promise<CaptureOutcome> {
  return submitCapture({
    items: draft.items,
    title: draft.title,
    trigger: draft.trigger,
    originUrl: draft.originUrl,
    metadata:
      draft.kind === "screenshot" && !metadata?.tags?.length
        ? { ...metadata, tags: ["screenshot"] }
        : metadata,
    cookies: await draftCookies(draft),
    fishId,
    announceTab: tabId,
  });
}

/** Opens the details window when the settings ask for it; pages that refuse the overlay save straight away. */
export async function offerDraft(
  draft: DetailsDraft | null,
  tabId: number | undefined,
): Promise<void> {
  if (!draft) {
    flashBadge(tabId, "failed");
    return;
  }
  const { askDetails } = await getSettings();
  if (askDetails && tabId !== undefined) {
    const library = await libraryTargets();
    if (await showOverlay(tabId, { view: "details", draft, library })) return;
  }
  await saveDraft(draft, tabId);
}

const SITE_ACTIONS = new Set(["like", "upvote", "bookmark", "star"]);

function siteTitle(url: string, trigger: string | undefined): string {
  const source = hostToSource(url);
  const label = source ? sourceLabel(source) : new URL(url).hostname;
  const action = trigger?.split(":")[1] ?? "";
  return `${label} ${SITE_ACTIONS.has(action) ? action : "save"}`;
}

/** Saves an item a site hook saw you save, like, or bookmark. */
export async function saveFromSite(
  url: string,
  trigger: string | undefined,
  tabId: number | undefined,
): Promise<CaptureOutcome> {
  await syncSettings(true);
  if (!allowsSiteCapture(url, trigger, await getSettings())) {
    /** The page hook ignores this result, so a like that is turned off stays quiet. */
    return { status: "sending", id: crypto.randomUUID() };
  }
  return submitCapture({
    items: [{ kind: "url", url }],
    title: siteTitle(url, trigger),
    trigger,
    announceTab: tabId,
  });
}

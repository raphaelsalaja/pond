import log from "electron-log/main.js";
import type { ShareLink } from "../../../shared/share-link-contracts";
import type { TransferRequest } from "../../../shared/transfer-contracts";
import { libraryRoot } from "../../paths";
import { notificationLog } from "../notifications";
import {
  exportSharePage,
  loadSharePageViewer,
  resolveSharePageTarget,
} from "../share-page";
import {
  checkTransferCancellation,
  runTransferJob,
  transferPhase,
  transferProgress,
} from "../transfer-jobs";
import { readShareHostConfig } from "./config";
import { s3ShareHost } from "./host";
import type { ShareHostConfig } from "./host";
import {
  newShareLinkId,
  publishShareLink,
  sameTarget,
  stopExpiredShareLinks,
  stopSharing,
} from "./publish";
import type { ShareLinkDeps, ShareLinkTarget } from "./publish";
import { readShareLinks } from "./records";

export { checkShareHost } from "./check";
export {
  readShareHostConfig,
  removeShareHostConfig,
  summarizeShareHost,
  writeShareHostConfig,
} from "./config";
export { ShareHostConfigSchema, s3ShareHost } from "./host";
export type { ShareHostConfig } from "./host";
export { readShareLinks } from "./records";

export class NoShareHostError extends Error {
  constructor() {
    super("Set up a Share Host in Settings first.");
    this.name = "NoShareHostError";
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function liveDeps(config: ShareHostConfig, root: string): ShareLinkDeps {
  return {
    libraryRoot: root,
    host: s3ShareHost(config),
    stage: async ({ target, destination, pageUrl }) =>
      exportSharePage({
        target,
        destination,
        libraryRoot: root,
        viewer: await loadSharePageViewer(),
        pageUrl,
      }),
    describe: async (target) => {
      const { kind, title } = await resolveSharePageTarget(target);
      return { kind, title };
    },
    now: Date.now,
    phase: (files) => transferPhase("Uploading", files),
    progress: async (key, bytes) => {
      checkTransferCancellation();
      await transferProgress(key, bytes);
    },
  };
}

async function requireConfig(): Promise<ShareHostConfig> {
  const config = await readShareHostConfig();
  if (!config) throw new NoShareHostError();
  return config;
}

/**
 * Publishes a Share Link as a transfer job, so the upload shows in Downloads with its progress
 * and can be cancelled or retried. The job carries the link's id, which a retry republishes.
 */
export async function publishShareLinkJob(
  target: ShareLinkTarget,
  id?: string,
): Promise<{ link: ShareLink; updated: boolean }> {
  const config = await requireConfig();
  const root = libraryRoot();
  const links = await readShareLinks(root);
  const linkId =
    id ??
    links.find((link) => sameTarget(link, target))?.id ??
    newShareLinkId();
  const record = links.find((link) => link.id === linkId);
  const deps = liveDeps(config, root);
  const request: TransferRequest = {
    kind: "publish_share_link",
    origin: root,
    destination: deps.host.publicUrl(`${linkId}/index.html`),
    source: linkId,
    ids: [...(record?.target.ids ?? target.ids)],
    folderId: record?.target.folderId ?? target.folderId,
  };
  try {
    const result = await runTransferJob(request, () =>
      publishShareLink(deps, {
        target,
        id: linkId,
        expiresAt: config.expireAfterDays
          ? Date.now() + config.expireAfterDays * DAY_MS
          : null,
      }),
    );
    await notificationLog.resolve([notificationId(linkId)]);
    return result;
  } catch (error) {
    const failure = error instanceof Error ? error : null;
    if (!isCancelled(failure))
      await reportFailure(linkId, record?.title, failure);
    throw error;
  }
}

/** Runs a publish a transfer retry asked for: the job's own link, with that link's target. */
export async function retryShareLinkTransfer(request: TransferRequest) {
  const config = await requireConfig();
  const id = request.source;
  if (!id) throw new Error("This upload has no Share Link to retry.");
  const result = await publishShareLink(liveDeps(config, libraryRoot()), {
    target: { ids: request.ids ?? [], folderId: request.folderId },
    id,
  });
  await notificationLog.resolve([notificationId(id)]);
  return { exported: result.link.saves, path: result.link.url };
}

export async function stopSharingLink(id: string): Promise<void> {
  const config = await requireConfig();
  await stopSharing(liveDeps(config, libraryRoot()), id);
  await notificationLog.resolve([notificationId(id)]);
}

/** The expiry sweep. Without a Share Host there's nothing Pond can remove, so it waits. */
export async function stopExpiredShareLinksNow(): Promise<void> {
  const config = await readShareHostConfig();
  if (!config) return;
  const root = libraryRoot();
  const { stopped, failed } = await stopExpiredShareLinks(
    liveDeps(config, root),
  );
  for (const link of stopped) {
    await notificationLog.post({
      id: `share-link-expired:${link.id}`,
      kind: "activity",
      priority: false,
      title: "Share Link Expired",
      body: `${link.title} is no longer shared.`,
      target: { type: "settings", section: "share-links" },
    });
    await notificationLog.resolve([notificationId(link.id)]);
  }
  for (const { link, error } of failed) {
    log.warn(
      "[pond share links] couldn't stop an expired link",
      link.id,
      error,
    );
    await notificationLog.post({
      id: notificationId(link.id),
      kind: "attention",
      priority: true,
      title: "Couldn't Remove an Expired Share Link",
      body: `${link.title} is still online. ${errorText(error)}`,
      target: { type: "settings", section: "share-links" },
    });
  }
}

function notificationId(id: string): string {
  return `share-link:${id}`;
}

async function reportFailure(
  id: string,
  title: string | undefined,
  error: Error | null,
) {
  log.warn("[pond share links] publish failed", id, error);
  await notificationLog.post({
    id: notificationId(id),
    kind: "attention",
    priority: true,
    title: "Couldn't Publish a Share Link",
    body: title ? `${title}: ${errorText(error)}` : errorText(error),
    target: { type: "settings", section: "share-links" },
  });
}

export function isCancelled(error: Error | null): boolean {
  return error?.name === "TransferCancelledError";
}

function errorText(error: Error | null): string {
  return error?.message || "Try again.";
}

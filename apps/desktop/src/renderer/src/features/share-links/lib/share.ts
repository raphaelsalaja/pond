import { Dialog } from "@pond/ui";
import { statusFeed } from "@/features/downloads/status-feed";
import { openSettings } from "@/shared/lib/open-settings";
import { notify } from "@/shared/lib/toast";

const SHARE_LINKS_SECTION = "share-links";

/** Opens a Share Link in the browser, which is how the person checks what visitors see. */
export function openShareLink(url: string): void {
  void window.pond.openExternal(url);
}

export async function copyShareLink(url: string): Promise<boolean> {
  const result = await window.pond.query("clipboard.writeText", { text: url });
  return result.ok;
}

/**
 * Publishes the Saves, or the Folder they came from, as a Share Link. A target that already
 * has one is republished at the same address. Asks first: the page becomes public to anyone
 * with its link.
 */
export async function shareSaves(
  ids: ReadonlyArray<string>,
  options: { folderId?: string; subject: string },
): Promise<void> {
  if (ids.length === 0) return;
  const { host } = await window.pond.query("shareHost.get", {});
  if (!host) {
    notify({
      id: "share-link",
      title: "Set Up a Share Host First",
      description: "Share Links upload to storage you own.",
      action: {
        label: "Open Settings",
        onClick: () => openSettings(SHARE_LINKS_SECTION),
      },
    });
    return;
  }
  Dialog.confirm({
    title: "Create Share Link",
    description: `Anyone with the link can open ${options.subject} and keep copies. Notes and tags stay private. Pond uploads the page to your Share Host.`,
    confirmLabel: "Create Link",
    onConfirm: () => {
      void publish(ids, options.folderId);
    },
  });
}

async function publish(
  ids: ReadonlyArray<string>,
  folderId?: string,
): Promise<void> {
  const job = statusFeed.start("Publishing Share Link");
  const result = await window.pond.query("shareLinks.publish", {
    ids: [...ids],
    folderId,
  });
  if (!result.ok) {
    if ("reason" in result) {
      statusFeed.dismiss(job);
      return;
    }
    statusFeed.fail(job, result.error);
    notify({
      id: "share-link",
      title: "Couldn't Publish the Share Link",
      description: result.error,
      action: {
        label: "Open Settings",
        onClick: () => openSettings(SHARE_LINKS_SECTION),
      },
    });
    return;
  }
  const copied = await copyShareLink(result.url);
  const done = result.updated ? "Share Link updated" : "Share Link published";
  statusFeed.done(job, done);
  notify({
    id: "share-link",
    title: copied
      ? result.updated
        ? "Share Link Updated and Copied"
        : "Share Link Copied"
      : done,
    description: result.url,
    action: { label: "Open", onClick: () => openShareLink(result.url) },
  });
}

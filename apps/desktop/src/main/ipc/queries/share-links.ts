import log from "electron-log/main.js";
import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import { ShareLinkIdSchema } from "../../../shared/share-link-contracts";
import type { ShareLinkPublishResult } from "../../../shared/share-link-contracts";
import {
  NoShareHostError,
  ShareHostConfigSchema,
  checkShareHost,
  isCancelled,
  publishShareLinkJob,
  readShareHostConfig,
  readShareLinks,
  removeShareHostConfig,
  s3ShareHost,
  stopSharingLink,
  summarizeShareHost,
  writeShareHostConfig,
} from "../../core/share-links";
import { libraryRoot } from "../../paths";
import { query, StringListParam } from "./params";
import type { QueryHandlerMap } from "./params";

const ShareHostInputSchema = ShareHostConfigSchema.extend({
  /** Empty keeps the saved secret, so editing other fields doesn't mean retyping it. */
  secretAccessKey: z.string().trim().max(256),
});

async function publishResult(
  run: () => ReturnType<typeof publishShareLinkJob>,
): Promise<ShareLinkPublishResult> {
  try {
    const { link, updated } = await run();
    return { ok: true, url: link.url, updated };
  } catch (error) {
    if (error instanceof NoShareHostError)
      return { ok: false, reason: "no_host" };
    if (isCancelled(error instanceof Error ? error : null))
      return { ok: false, reason: "cancelled" };
    log.warn("[pond ipc] share link publish failed", error);
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't publish the Share Link.",
    };
  }
}

export const shareLinkQueries = {
  async "shareHost.get"(): Promise<QueryResult<"shareHost.get">> {
    const config = await readShareHostConfig();
    return { host: config ? summarizeShareHost(config) : null };
  },

  /** Saves the Share Host only after it passes the connection check, so a broken one is never kept. */
  "shareHost.save": query(
    z.unknown(),
    async (input): Promise<QueryResult<"shareHost.save">> => {
      const parsed = ShareHostInputSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: parsed.error.issues[0]?.message ?? "Check the fields.",
        };
      }
      const secret =
        parsed.data.secretAccessKey ||
        (await readShareHostConfig())?.secretAccessKey;
      if (!secret) return { ok: false, error: "Enter the secret access key." };
      const config = { ...parsed.data, secretAccessKey: secret };
      const check = await checkShareHost(s3ShareHost(config));
      if (!check.ok) return check;
      await writeShareHostConfig(config);
      return { ok: true };
    },
  ),

  async "shareHost.remove"(): Promise<QueryResult<"shareHost.remove">> {
    await removeShareHostConfig();
    return { ok: true };
  },

  async "shareLinks.list"(): Promise<QueryResult<"shareLinks.list">> {
    const links = await readShareLinks(libraryRoot());
    return links.toSorted((a, b) => b.createdAt - a.createdAt);
  },

  "shareLinks.publish": query(
    z.object({ ids: StringListParam, folderId: z.string().optional() }),
    ({ ids, folderId }): Promise<QueryResult<"shareLinks.publish">> => {
      const saves = ids.filter(Boolean);
      if (saves.length === 0) {
        return Promise.resolve({ ok: false, error: "Choose Saves to share." });
      }
      return publishResult(() =>
        publishShareLinkJob({ ids: saves, folderId: folderId || undefined }),
      );
    },
  ),

  "shareLinks.update": query(
    z.object({ id: ShareLinkIdSchema }),
    async ({ id }): Promise<QueryResult<"shareLinks.update">> => {
      const link = (await readShareLinks(libraryRoot())).find(
        (entry) => entry.id === id,
      );
      if (!link)
        return { ok: false, error: "This Share Link no longer exists." };
      return publishResult(() => publishShareLinkJob(link.target, id));
    },
  ),

  "shareLinks.stop": query(
    z.object({ id: ShareLinkIdSchema }),
    async ({ id }): Promise<QueryResult<"shareLinks.stop">> => {
      try {
        await stopSharingLink(id);
        return { ok: true };
      } catch (error) {
        log.warn("[pond ipc] stop sharing failed", error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Couldn't remove the Share Link's files.",
        };
      }
    },
  ),
} satisfies QueryHandlerMap;

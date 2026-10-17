import type { ConnectedAccount, ImportScope } from "@pond/schema/db";
import {
  accountImportScope,
  importsListKind,
} from "../../../shared/import-scope";
import type {
  BookmarksHarvestArgs,
  BookmarksHarvestResult,
} from "../refresh/harvest/twitter";

export function shouldHarvestTwitterLikes(
  account: {
    handle: string | null;
    sync: { syncLikes?: boolean; importScope?: ImportScope };
  },
  aborted: boolean,
): boolean {
  const handle = account.handle?.replace(/^@/, "").trim();
  return importsLikes(account.sync) && !aborted && Boolean(handle);
}

function importsLikes(sync: {
  syncLikes?: boolean;
  importScope?: ImportScope;
}): boolean {
  return importsListKind(accountImportScope("twitter", sync), "liked");
}

interface TwitterLikesDependencies {
  harvestTwitterLikes: (
    args: BookmarksHarvestArgs,
    options: { partition: string; handle: string },
  ) => Promise<BookmarksHarvestResult>;
}

export async function harvestConfiguredTwitterLikes(
  account: ConnectedAccount,
  input: {
    aborted: boolean;
    knownIds: string[];
    partition: string;
  },
  dependencies: TwitterLikesDependencies,
): Promise<BookmarksHarvestResult | null> {
  if (!importsLikes(account.sync)) return null;
  if (!shouldHarvestTwitterLikes(account, input.aborted)) {
    return { ok: false, reason: "no_match" };
  }
  return dependencies.harvestTwitterLikes(
    { knownIds: input.knownIds },
    {
      partition: input.partition,
      handle: account.handle?.replace(/^@/, "").trim() ?? "",
    },
  );
}

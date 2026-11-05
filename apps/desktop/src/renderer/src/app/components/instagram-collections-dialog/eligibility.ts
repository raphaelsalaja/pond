import type { ImportScope, Source } from "@pond/schema/db";
import { importsListKind } from "@shared/import-scope";

export const INSTAGRAM_COLLECTIONS_NOTICE = "instagram-collections";

type NoticeStep = "skip" | "mark-seen" | "show";

interface NoticeAccount {
  id: string;
  source: Source;
  sync: { importScope?: ImportScope | undefined };
}

/** Collections never loaded before this build, so any Instagram Account still filing none was left without a choice. */
export function instagramAccountsToNotify(
  accounts: readonly NoticeAccount[],
  librarySaves: number,
): string[] {
  if (librarySaves === 0) return [];
  return accounts
    .filter(({ source, sync: { importScope: scope } }) => {
      if (source !== "instagram" || !importsListKind(scope, "saved")) {
        return false;
      }
      return !scope?.collections?.length && scope?.addToFolders !== true;
    })
    .map((account) => account.id);
}

/** A library with no affected Account has nothing to announce, so it records the notice without showing it. */
export function instagramCollectionsNoticeStep(input: {
  seen: readonly string[];
  accountIds: readonly string[];
}): NoticeStep {
  if (input.seen.includes(INSTAGRAM_COLLECTIONS_NOTICE)) return "skip";
  return input.accountIds.length > 0 ? "show" : "mark-seen";
}

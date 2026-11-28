import type { Source } from "@pond/schema/db";
import { isPredicateList } from "@pond/schema/filters/types";
import { sourceLabel } from "@pond/schema/sources";
import { useMemo } from "react";
import { useFolders } from "@/features/library";
import { describePredicate } from "@/features/search/query";
import { useAccounts, useWatches } from "@/features/sources";
import type { RuleNames } from "../lib/summary";

export interface RuleOwner {
  id: string;
  label: string;
  kind: "account" | "watch";
}

function ownerLabel(
  source: Source,
  label: string | null,
  handle: string | null,
): string {
  const who = label?.trim() || handle?.trim();
  return who ? `${sourceLabel(source)} ${who}` : sourceLabel(source);
}

/** Accounts and Watches a Rule can be limited to. */
export function useRuleOwners(): Array<RuleOwner> {
  const { accounts } = useAccounts();
  const { watches } = useWatches();
  return useMemo(
    () => [
      ...accounts.map((account) => ({
        id: account.id,
        label: ownerLabel(account.source, account.label, account.handle),
        kind: "account" as const,
      })),
      ...watches.map((watch) => ({
        id: watch.id,
        label: ownerLabel(watch.source, watch.label, watch.handle),
        kind: "watch" as const,
      })),
    ],
    [accounts, watches],
  );
}

export function useRuleNames(): RuleNames {
  const folders = useFolders();
  const owners = useRuleOwners();
  return useMemo(() => {
    const folderNames = new Map(
      folders.map((folder) => [folder.id, folder.name]),
    );
    const ownerNames = new Map(owners.map((owner) => [owner.id, owner.label]));
    return {
      folder: (id) => folderNames.get(id) ?? null,
      owner: (id) => ownerNames.get(id) ?? null,
      predicate: (clause) => {
        if ("rules" in clause) return "a group";
        if (clause.field === "folder") {
          const ids = isPredicateList(clause.value)
            ? clause.value
            : [clause.value];
          const named = ids.map(
            (id) => folderNames.get(String(id)) ?? "a deleted folder",
          );
          return `${clause.negate ? "not " : ""}in ${named.join(" or ")}`;
        }
        const chip = describePredicate(clause);
        return `${chip.negated ? "not " : ""}${chip.label}`;
      },
    };
  }, [folders, owners]);
}

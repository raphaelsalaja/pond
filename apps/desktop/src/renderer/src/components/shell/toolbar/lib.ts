import type { Source } from "@pond/schema/db";
import { cardModel } from "@/components/library/sources/sync-monitor/lib/helpers";
import type { AccountRow } from "@/hooks/use-accounts";
import type { WatchRow } from "@/hooks/use-watches";
import { getSourceDef } from "@/lib/save/sources-registry";
import { getAppRouter } from "@/lib/ui/app-router";
import { settingsModal } from "@/stores/settings-modal";
import type { SyncAccountStatus } from "@/stores/sync-monitor";

export type RowTone = "run" | "ok" | "warn" | "err" | "idle";

export interface StatusEntity {
  id: string;
  kind: "account" | "watch";
  source: Source;
  title: string;
  model: ReturnType<typeof cardModel>;
  tone: RowTone;
}

export function toneFromModel(
  tone: ReturnType<typeof cardModel>["tone"],
): RowTone {
  if (tone === "run") return "run";
  if (tone === "ok") return "ok";
  if (tone === "paused") return "warn";
  if (tone === "err") return "err";
  return "idle";
}

function entityTitle(
  source: Source,
  handle: string | null,
  label: string | null,
): string {
  const brand = getSourceDef(source).label;
  const name = label?.trim() || handle?.trim();
  if (!name) return brand;
  return `${name} · ${brand}`;
}

export function buildEntities(
  accounts: AccountRow[],
  watches: WatchRow[],
  byAccount: Record<string, SyncAccountStatus>,
): StatusEntity[] {
  const out: StatusEntity[] = [];
  for (const row of accounts) {
    if (!row.connected) continue;
    const status = byAccount[row.id];
    if (!status) continue;
    const model = cardModel(status);
    out.push({
      id: row.id,
      kind: "account",
      source: row.source,
      title: entityTitle(row.source, row.handle, row.label),
      model,
      tone: toneFromModel(model.tone),
    });
  }
  for (const row of watches) {
    const status = byAccount[row.id];
    if (!status) continue;
    const model = cardModel(status);
    out.push({
      id: row.id,
      kind: "watch",
      source: row.source,
      title: entityTitle(row.source, row.handle, row.label),
      model,
      tone: toneFromModel(model.tone),
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export function openSources(): void {
  void getAppRouter()?.navigate({ to: "/sources" });
}

export function openFunnel(): void {
  settingsModal.open("funnel");
}

export type Panel =
  | "progress"
  | "recent"
  | "errors"
  | "ongoing"
  | "media-index";

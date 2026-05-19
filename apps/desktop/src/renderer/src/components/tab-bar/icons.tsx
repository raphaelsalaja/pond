import {
  IconArchiveContent2Outline18,
  IconBoltOutline18,
  IconBookmarkOutline18,
  IconChartActivityOutline18,
  IconHourglassClockOutline18,
  IconShuffleSparkleOutline18,
  IconSliderOutline18,
  IconTagSlashOutline18,
  IconTrash2ContentOutline18,
} from "@pond/icons/outline/18";
import type { IconComponent } from "@pond/icons/types";
import { getSourceMeta } from "@/components/source-badge";
import { SECTIONS } from "@/pages/settings/registry";
import type { Save } from "@/pool/types";
import { extractSaveId, stripSaveSplit } from "./labels";

const ROUTE_ICONS: Record<string, IconComponent> = {
  "/": IconArchiveContent2Outline18,
  "/untagged": IconTagSlashOutline18,
  "/recents": IconHourglassClockOutline18,
  "/random": IconShuffleSparkleOutline18,
  "/trash": IconTrash2ContentOutline18,
  "/activity": IconChartActivityOutline18,
  "/settings": IconSliderOutline18,
  "/welcome": IconBoltOutline18,
};

function settingsSectionIcon(path: string): IconComponent | null {
  const m = path.match(/^\/settings\/([^/?]+)/);
  if (!m) return null;
  return SECTIONS.find((s) => s.path === m[1])?.icon ?? null;
}

function sourceIcon(path: string): IconComponent | null {
  const m = path.match(/^\/source\/([^/?]+)/);
  if (!m) return null;
  return getSourceMeta(m[1]!)?.Icon ?? null;
}

export function iconForPath(path: string): IconComponent {
  const clean = stripSaveSplit(path).split("?")[0]!;

  const exact = ROUTE_ICONS[clean];
  if (exact) return exact;

  const section = settingsSectionIcon(clean);
  if (section) return section;

  const source = sourceIcon(clean);
  if (source) return source;

  if (extractSaveId(clean)) return IconBookmarkOutline18;

  return IconBookmarkOutline18;
}

export function iconForTab(
  path: string,
  save: Save | undefined,
): IconComponent {
  if (save) {
    const meta = getSourceMeta(save.source);
    if (meta) return meta.Icon;
    return IconBookmarkOutline18;
  }
  return iconForPath(path);
}

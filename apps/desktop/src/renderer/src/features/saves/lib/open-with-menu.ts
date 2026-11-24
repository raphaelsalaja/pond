import { IconApplications } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { createElement } from "react";
import type { Save } from "@/features/saves/types";
import { notify } from "@/shared/lib/toast";

export interface OpenWithApp {
  name: string;
  path: string;
  icon: string | null;
  isDefault: boolean;
}

const appsByKind = new Map<string, Array<OpenWithApp>>();

export function openWithKind(save: Save, fileIndex?: number | null): string {
  const file =
    fileIndex === undefined || fileIndex === null
      ? save.files[0]
      : save.files[fileIndex];
  const mime = file?.mimeType?.trim();
  if (mime) {
    return mime.toLowerCase();
  }
  const path = file?.path ?? "";
  const dot = path.lastIndexOf(".");
  if (dot >= 0) {
    return path.slice(dot).toLowerCase();
  }
  return save.mediaType ?? save.id;
}

export function peekOpenWithApps(kind: string): Array<OpenWithApp> {
  return appsByKind.get(kind) ?? [];
}

function notifyOpenWith(result: {
  ok: boolean;
  reason?: string;
  error?: string;
}): void {
  if (!result.ok && result.reason !== "cancelled") {
    notify({
      id: "open-with",
      title: "Couldn't open Save",
      description: result.error,
    });
  }
}

export function openWith(
  ids: Array<string>,
  fileIndex: number | null,
  application: string,
): void {
  void window.pond
    .query("saves.openWith", {
      ids,
      fileIndex: ids.length > 1 ? undefined : (fileIndex ?? undefined),
      application,
    })
    .then(notifyOpenWith)
    .catch(() => notify({ id: "open-with", title: "Couldn't open Save" }));
}

export function openWithMenuItems(
  ids: Array<string>,
  fileIndex: number | null,
  apps: ReadonlyArray<OpenWithApp>,
): Array<MenuItemSpec> {
  return apps.map((entry) => ({
    id: entry.path,
    label: entry.isDefault ? `${entry.name} (Default)` : entry.name,
    icon: entry.icon
      ? createElement("img", {
          src: entry.icon,
          alt: "",
          width: 16,
          height: 16,
          draggable: false,
        })
      : createElement(IconApplications),
    onClick: () => openWith(ids, fileIndex, entry.path),
  }));
}

export async function loadOpenWithApps({
  ids,
  fileIndex,
  kind,
  onApps,
}: {
  ids: Array<string>;
  fileIndex?: number | null;
  kind: string;
  onApps: (apps: Array<OpenWithApp>) => void;
}): Promise<void> {
  const cached = appsByKind.get(kind);
  if (cached?.length) {
    onApps(cached);
  }
  try {
    const apps = await listOpenWithApps(ids, fileIndex);
    if (apps.length) {
      appsByKind.set(kind, apps);
      onApps(apps);
    } else if (!cached?.length) {
      onApps([]);
    }
    if (!apps.some((app) => app.icon === null)) {
      return;
    }
    const next = await listOpenWithApps(ids, fileIndex, true);
    if (!next.length) {
      return;
    }
    appsByKind.set(kind, next);
    onApps(next);
  } catch {
    if (cached?.length) {
      onApps(cached);
    }
  }
}

async function listOpenWithApps(
  ids: Array<string>,
  fileIndex?: number | null,
  includeIcons = false,
): Promise<Array<OpenWithApp>> {
  const listed = await window.pond.query("saves.listOpenWith", {
    ids,
    fileIndex: fileIndex ?? undefined,
    includeIcons: includeIcons || undefined,
  });
  return listed.apps ?? [];
}

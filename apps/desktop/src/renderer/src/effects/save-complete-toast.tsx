import { useToast } from "@pond/ui";
import { useEffect } from "react";
import { getSourceLabel } from "@/components/source-badge";
import { getPrefsSnapshot } from "@/pool/prefs";
import type { SyncActionEvent } from "@/pool/reconcile";
import type { Save } from "@/pool/types";

/**
 * In-app "Saved from <source>" toast. The OS notification counterpart
 * lives in `apps/desktop/src/main/core/notifications.ts`. They split on
 * focus: this side only fires when a pond window is focused; the OS
 * notification covers the case where the user is over in their browser
 * clicking bookmark on a tweet.
 *
 * Both sides gate on `prefs.notifications.saveComplete`.
 */
export function SaveCompleteToast() {
  const toast = useToast();

  useEffect(() => {
    return window.pond.onSyncAction((raw) => {
      const event = raw as SyncActionEvent;
      if (event.modelName !== "save" || event.action !== "I") return;

      if (getPrefsSnapshot()?.notifications?.saveComplete === false) return;

      // OS notification handles unfocused windows; skip here so the
      // user doesn't get hit with both at once.
      if (typeof document !== "undefined" && !document.hasFocus()) return;

      const save = event.data as Partial<Save> | null;
      if (!save?.source) return;

      toast.add({
        title: `Saved from ${getSourceLabel(save.source)}`,
        description: pickDescription(save) ?? undefined,
        type: "success",
      });
    });
  }, [toast]);

  return null;
}

function pickDescription(save: Partial<Save>): string | null {
  const title = trim(save.title);
  if (title) return title;
  const description = trim(save.description);
  if (description) return description;
  return hostFromUrl(save.url);
}

function trim(value: string | null | undefined): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > 140 ? `${collapsed.slice(0, 137)}…` : collapsed;
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

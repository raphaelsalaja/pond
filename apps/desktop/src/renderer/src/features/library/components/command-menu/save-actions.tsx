import { IconArrowUpRight } from "@pond/icons";
import { flushSync } from "react-dom";
import { buildSaveMenu } from "@/features/saves/lib/menu";
import { selectOnlySave } from "@/features/saves/lib/select";
import { selection } from "@/features/saves/state/selection";
import type { Save } from "@/features/saves/types";
import { tagClipboard } from "@/features/tags";
import { specEntries } from "./spec-entries";
import type { MenuEntry } from "./types";

/** Right-click selects the Save first; the menu does the same so selection-based actions like Add Tags hit it. */
function onSave(entry: MenuEntry, focus: () => void): MenuEntry {
  const { run, page } = entry;
  return {
    ...entry,
    run:
      run &&
      (() => {
        focus();
        run();
      }),
    page:
      page &&
      (() => {
        const next = page();
        return next.kind === "actions"
          ? {
              ...next,
              entries: next.entries.map((child) => onSave(child, focus)),
            }
          : next;
      }),
  };
}

export function saveActions(
  save: Save,
  options: { openId: string | null; onOpenSave: (id: string) => void },
): MenuEntry[] {
  const { openId, onOpenSave } = options;
  const select = () => {
    if (!selection.has(save.id)) flushSync(() => selectOnlySave(save.id));
  };
  const items = buildSaveMenu(save, {
    clipboardEmpty: tagClipboard.get().length === 0,
    opened: false,
  });
  const entries = specEntries(items, "", `save:${save.id}`).flatMap((entry) => {
    if (entry.label === "Open Save") return [];
    /** The open Save's pane owns the title field, so renaming another Save opens it first. */
    if (entry.label === "Rename" && openId && openId !== save.id) {
      return [onSave(entry, () => onOpenSave(save.id))];
    }
    return [onSave(entry, select)];
  });
  return [
    {
      id: "action:open",
      group: "",
      label: "Open Save",
      icon: <IconArrowUpRight aria-hidden />,
      keywords: "view show",
      run: () => onOpenSave(save.id),
    },
    ...entries,
  ];
}

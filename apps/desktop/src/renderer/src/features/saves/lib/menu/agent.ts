import {
  IconArrowRotateClockwise,
  IconChatBubble,
  IconMediaPlay,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { addSavesToChat } from "@/features/agent";
import {
  failedIdsIn,
  retryFailedSelection,
} from "@/features/saves/lib/selection";
import { selectableTasks } from "@/features/saves/lib/tasks";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

export interface AgentMenuItems {
  agent: Array<MenuItemSpec>;
  maintenance: Array<MenuItemSpec>;
}

export function buildAgentItems({
  ids,
  allTrashed,
  incomplete,
}: SaveMenuContext): AgentMenuItems {
  const prefs = getPrefsSnapshot();
  const agent: Array<MenuItemSpec> = [
    {
      label: "Add to Chat",
      icon: glyph(IconChatBubble),
      hidden: allTrashed,
      onClick: () => addSavesToChat(ids),
    },
  ];
  const maintenance: Array<MenuItemSpec> = [];
  for (const task of selectableTasks()) {
    const items =
      task.id === "re-embed" || task.id === "rebuild-visual"
        ? maintenance
        : agent;
    items.push({
      label: task.label,
      icon: glyph(IconMediaPlay),
      hidden: allTrashed,
      keywords: task.keywords.join(" "),
      disabled: (task.precondition?.(prefs) ?? null) !== null,
      onClick: () => {
        void Promise.resolve(task.run(ids));
      },
    });
  }
  if (incomplete || failedIdsIn(ids).length > 0) {
    agent.push({
      label: "Retry Failed",
      icon: glyph(IconArrowRotateClockwise),
      onClick: () => void retryFailedSelection(ids),
    });
  }
  return { agent, maintenance };
}

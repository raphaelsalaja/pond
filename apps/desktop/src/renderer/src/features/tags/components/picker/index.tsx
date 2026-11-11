import { type ButtonProps, PickerPanel } from "@pond/ui";
import { createContext, use, useCallback, useMemo, useState } from "react";
import type { Save } from "@/features/saves/types";
import { TagMenu } from "@/features/tags/components/menu";
import { tagOperations } from "@/features/tags/operations/tag-client";
import {
  type TagGroupRow,
  useTagGroups,
} from "@/features/tags/state/tag-groups";
import { useTags } from "@/features/tags/state/tags";
import { usePrefs } from "@/shared/state/prefs";

type PopoverAnchor = Element | null | (() => Element | null) | undefined;

type TagPickerTarget =
  | { kind: "save"; save: Save }
  | { kind: "group"; group: TagGroupRow };

interface TagPickerContextValue {
  target: TagPickerTarget;
  preferences: ReturnType<typeof usePrefs<"tagPicker">>[0];
}

const TagPickerContext = createContext<TagPickerContextValue | null>(null);

function useTagPickerContext(): TagPickerContextValue {
  const ctx = use(TagPickerContext);
  if (!ctx) {
    throw new Error("TagPicker.* must be used inside <TagPicker.Root>");
  }
  return ctx;
}

interface RootProps {
  target: TagPickerTarget;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function Root({
  target,
  open: controlledOpen,
  onOpenChange,
  children,
}: RootProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [preferences] = usePrefs("tagPicker");
  const open = controlledOpen ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <TagPickerContext.Provider value={{ target, preferences }}>
      <PickerPanel.Root
        open={open}
        onOpenChange={(next, details) => {
          if (
            !next &&
            preferences.pinned &&
            (details.reason === "outside-press" ||
              details.reason === "focus-out")
          ) {
            details.cancel();
            return;
          }
          setOpen(next);
        }}
      >
        {children}
      </PickerPanel.Root>
    </TagPickerContext.Provider>
  );
}

function Trigger(props: ButtonProps) {
  return <PickerPanel.Trigger {...props} />;
}

interface ContentProps {
  anchor?: PopoverAnchor;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

function Content({
  anchor,
  side = "bottom",
  align = "start",
  sideOffset = 6,
}: ContentProps) {
  const { target, preferences } = useTagPickerContext();
  const tags = useTags();
  const groups = useTagGroups();

  const liveGroup = useMemo(() => {
    if (target.kind !== "group") return null;
    return groups.find((g) => g.id === target.group.id) ?? target.group;
  }, [target, groups]);

  const tagsByLowerName = useMemo(() => {
    const map = new Map<string, (typeof tags)[number]>();
    for (const t of tags) map.set(t.name.toLowerCase(), t);
    return map;
  }, [tags]);

  const appliedSet = useMemo(() => {
    if (target.kind === "save") {
      return new Set(target.save.tags.map((t) => t.toLowerCase()));
    }
    return new Set((liveGroup?.tagNames ?? []).map((t) => t.toLowerCase()));
  }, [target, liveGroup]);

  const toggle = useCallback(
    async (rawName: string, options?: { created?: boolean }) => {
      const cleaned = rawName.trim();
      if (!cleaned) return;
      const lower = cleaned.toLowerCase();
      if (target.kind === "save") {
        const save = target.save;
        const next = appliedSet.has(lower)
          ? save.tags.filter((t) => t.toLowerCase() !== lower)
          : [...save.tags, cleaned];
        await window.pond.query("tags.setForSave", {
          saveId: save.id,
          tags: next,
        });
        return;
      }
      const groupName = (liveGroup ?? target.group).name;
      if (appliedSet.has(lower)) {
        await tagOperations.removeFromGroup(cleaned, groupName);
        return;
      }
      if (!options?.created && !tagsByLowerName.has(lower)) {
        await tagOperations.create("tag", cleaned);
      }
      await tagOperations.addToGroup(cleaned, groupName);
    },
    [target, liveGroup, appliedSet, tagsByLowerName],
  );

  return (
    <PickerPanel.Portal>
      <PickerPanel.Positioner
        anchor={anchor}
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={{ top: 48 }}
      >
        <PickerPanel.Popup>
          <TagMenu
            appliedKeys={appliedSet}
            onToggle={toggle}
            allowCreate
            recommendedNames={
              target.kind === "save" ? (target.save.suggestedTags ?? []) : []
            }
            layout={preferences.layout}
            gridSize={preferences.gridSize}
            showStarred={preferences.showStarred}
            showRecently={preferences.showRecently}
            showRecommended={preferences.showRecommended}
            showCounts={preferences.showCounts}
            pinned={preferences.pinned}
          />
        </PickerPanel.Popup>
      </PickerPanel.Positioner>
    </PickerPanel.Portal>
  );
}

export const TagPicker = { Root, Trigger, Content };

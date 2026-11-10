import { PickerPanel } from "@pond/ui";
import { useSelector } from "@tanstack/react-store";
import { useRef, useState } from "react";
import { pool, savesStore } from "@/features/saves/state/pool";
import {
  closeSaveTagPicker,
  type SaveTagPickerRequest,
  saveTagPickerStore,
} from "@/features/saves/state/tag-picker";
import type { Save } from "@/features/saves/types";
import { TagMenu } from "@/features/tags";
import { usePrefs } from "@/shared/state/prefs";

function savesFor(ids: readonly string[]): Save[] {
  return ids.flatMap((id) => {
    const save = pool.get(id);
    return save ? [save] : [];
  });
}

function nextTags(
  tags: readonly string[],
  name: string,
  remove: boolean,
): string[] {
  const lower = name.toLowerCase();
  if (remove) return tags.filter((tag) => tag.toLowerCase() !== lower);
  if (tags.some((tag) => tag.toLowerCase() === lower)) return [...tags];
  return [...tags, name];
}

/** Adds the tag to every targeted Save, or removes it when every Save already has it. */
async function toggleTagOnSaves(
  ids: readonly string[],
  name: string,
): Promise<void> {
  const cleaned = name.trim();
  if (!cleaned || ids.length === 0) return;
  const lower = cleaned.toLowerCase();
  const before = savesFor(ids);
  const remove =
    before.length > 0 &&
    before.every((save) =>
      save.tags.some((tag) => tag.toLowerCase() === lower),
    );
  if (before.length > 0) {
    pool.bulkUpsert(
      before.map((save) => ({
        ...save,
        tags: nextTags(save.tags, cleaned, remove),
      })),
    );
  }
  try {
    await window.pond.query("saves.bulkEdit", {
      ids: [...ids],
      operation: {
        kind: "tags",
        tags: [cleaned],
        mode: remove ? "remove" : "add",
      },
    });
  } catch (error) {
    if (before.length > 0) pool.bulkUpsert(before);
    throw error;
  }
}

function cardElement(id: string | null): HTMLElement | null {
  if (!id) return null;
  const node = document.querySelector(`[data-save-id="${CSS.escape(id)}"]`);
  return node instanceof HTMLElement ? node : null;
}

function SaveTagPicker({
  session,
  open,
}: {
  session: SaveTagPickerRequest;
  open: boolean;
}) {
  const [preferences] = usePrefs("tagPicker");
  const fallbackRef = useRef<HTMLDivElement>(null);
  const saves = useSelector(savesStore, (state) =>
    session.ids.flatMap((id) => {
      const save = state.byId.get(id);
      return save ? [save] : [];
    }),
  );
  const applied = new Set<string>();
  const mixed = new Set<string>();
  const counts = new Map<string, number>();
  for (const save of saves) {
    const seen = new Set<string>();
    for (const name of save.tags) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of counts) {
    if (saves.length > 0 && count === saves.length) applied.add(key);
    else mixed.add(key);
  }
  const recommended = saves.length === 1 ? (saves[0]?.suggestedTags ?? []) : [];

  return (
    <>
      <div
        ref={fallbackRef}
        data-tag-picker-anchor=""
        style={{
          position: "fixed",
          top: "30%",
          left: "50%",
          width: 0,
          height: 0,
        }}
      />
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
          if (!next) closeSaveTagPicker();
        }}
      >
        <PickerPanel.Portal>
          <PickerPanel.Positioner
            anchor={() => cardElement(session.anchorId) ?? fallbackRef.current}
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={{ top: 48 }}
          >
            <PickerPanel.Popup aria-label="Add Tags">
              <TagMenu
                appliedKeys={applied}
                mixedKeys={mixed}
                counts={counts}
                allowCreate
                recommendedNames={recommended}
                layout={preferences.layout}
                gridSize={preferences.gridSize}
                showStarred={preferences.showStarred}
                showRecently={preferences.showRecently}
                showRecommended={preferences.showRecommended}
                showCounts={preferences.showCounts}
                pinned={preferences.pinned}
                onToggle={(name) => toggleTagOnSaves(session.ids, name)}
              />
            </PickerPanel.Popup>
          </PickerPanel.Positioner>
        </PickerPanel.Portal>
      </PickerPanel.Root>
    </>
  );
}

export function SaveTagPickerHost() {
  const request = useSelector(saveTagPickerStore, (state) => state);
  const [session, setSession] = useState(request);
  if (request && request.key !== session?.key) setSession(request);
  if (!session) return null;
  return (
    <SaveTagPicker
      key={session.key}
      session={session}
      open={request?.key === session.key}
    />
  );
}

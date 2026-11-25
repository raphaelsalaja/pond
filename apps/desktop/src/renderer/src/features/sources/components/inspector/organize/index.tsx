import type { Folder, IncomingSaveRule } from "@pond/schema/db";
import { Select, Settings } from "@pond/ui";
import type { SourceTargetInput } from "@shared/account-contracts";
import { useEffect, useMemo, useState } from "react";
import { folders as folderStore, useFolders } from "@/features/library";
import { ChipsField } from "@/features/sources/components/chips-field";
import { useTags } from "@/features/tags";
import { notify } from "@/shared/lib/toast";

const NONE = "none";

function folderPath(folder: Folder, byId: Map<string, Folder>): string {
  const names = [folder.name];
  let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
  while (parent) {
    names.unshift(parent.name);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return names.join(" / ");
}

export function SourceOrganize({
  target,
  incoming,
  onChanged,
}: {
  target: SourceTargetInput;
  incoming: IncomingSaveRule | undefined;
  onChanged: () => void;
}) {
  const folders = useFolders();
  const tags = useTags();
  useEffect(() => {
    if (folderStore.snapshot().length === 0) void folderStore.refresh();
  }, []);
  const [draft, setDraft] = useState({
    folderId: incoming?.folderId ?? null,
    tags: incoming?.tags ?? [],
  });
  const folderItems = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    return [
      { value: NONE, label: "None" },
      ...folders
        .map((folder) => ({
          value: folder.id,
          label: folderPath(folder, byId),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [folders]);
  const tagNames = useMemo(() => {
    const names = new Set(tags.map((tag) => tag.name));
    for (const name of draft.tags) names.add(name);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [tags, draft.tags]);
  const save = async (next: typeof draft) => {
    const previous = draft;
    setDraft(next);
    const result = await window.pond.query("sources.setIncoming", {
      ...target,
      ...next,
    });
    if (!result.ok) {
      setDraft(previous);
      notify({
        id: "source-incoming",
        title: "Couldn't save. Try again.",
      });
      return;
    }
    onChanged();
  };
  const folderValue =
    draft.folderId && folderItems.some((item) => item.value === draft.folderId)
      ? draft.folderId
      : NONE;
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Add to Folder</Settings.ItemTitle>
          <Settings.ItemDescription>
            New saves land here.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Select.Root
            value={folderValue}
            onValueChange={(next) => {
              if (!next) return;
              void save({ ...draft, folderId: next === NONE ? null : next });
            }}
          >
            <Select.Trigger aria-label="Add to Folder">
              <Select.Value>
                {(selected: string) =>
                  folderItems.find((item) => item.value === selected)?.label ??
                  "None"
                }
              </Select.Value>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner sideOffset={6}>
                <Select.Popup>
                  <Select.Items items={folderItems} />
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </Settings.ItemControl>
      </Settings.Item>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Add Tags</Settings.ItemTitle>
          <Settings.ItemDescription>
            Added to every new save.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <ChipsField
            label="Add Tags"
            placeholder="No Tags"
            items={tagNames}
            value={draft.tags}
            labelOf={(name) => name}
            empty={tags.length === 0 ? "No tags yet" : "No tags match"}
            onValueChange={(next) => void save({ ...draft, tags: next })}
          />
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}

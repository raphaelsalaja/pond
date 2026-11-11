import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import {
  BatchRenameDialog,
  type BatchRenameItem,
} from "@/features/library/components/batch-rename";
import { closeRenameDialog } from "@/features/library/state/rename-dialog";
import { CardThumb } from "@/features/saves";
import {
  ensureSaves,
  reloadSaves,
  savesStore,
  useRetainedSaves,
} from "@/features/saves/pool";

const TOKENS = [
  { token: "{n}", label: "Number" },
  { token: "{title}", label: "Name" },
  { token: "{date}", label: "Date" },
  { token: "{tags}", label: "Tags" },
  { token: "{original}", label: "File Name" },
];

const NOUN = { one: "Save", other: "Saves" };

export function RenameDialog({
  ids,
  open,
}: {
  ids: readonly string[];
  open: boolean;
}) {
  const saves = useSelector(
    savesStore,
    (state) => ids.map((id) => state.byId.get(id)),
    {
      compare: (a, b) =>
        a.length === b.length && a.every((save, index) => save === b[index]),
    },
  );
  useRetainedSaves(ids);
  useEffect(() => {
    void ensureSaves(ids);
  }, [ids]);
  const items = useMemo(
    () =>
      saves.flatMap((save): BatchRenameItem[] => {
        if (!save) return [];
        const path = save.files[0]?.path;
        return [
          {
            id: save.id,
            name: save.title || "Untitled",
            original: path
              ?.split("/")
              .pop()
              ?.replace(/\.[^.]+$/, ""),
            date: save.savedAt,
            tags: save.tags,
            preview: (
              <span>
                <CardThumb save={save} width={32} />
              </span>
            ),
          },
        ];
      }),
    [saves],
  );

  return (
    <BatchRenameDialog
      open={open}
      noun={NOUN}
      items={items}
      tokens={TOKENS}
      defaultPattern="{title} {n}"
      onClose={closeRenameDialog}
      onRename={async (request) => {
        const result = await window.pond.query("saves.batchRename", request);
        if (!result.ok) throw new Error("Enter a name and try again.");
        await reloadSaves(request.ids);
        closeRenameDialog();
      }}
    />
  );
}

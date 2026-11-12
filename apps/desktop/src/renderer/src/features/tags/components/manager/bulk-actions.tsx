import { Button, Dialog, Input } from "@pond/ui";
import { DataTable } from "@pond/ui/data-table";
import { type MutableRefObject, useState } from "react";
import { tagOperations } from "@/features/tags/operations/tag-client";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

type Draft = {
  kind: "merge" | "group";
  names: string[];
  value: string;
};

function confirmBulkDelete(names: string[], onDone: () => void) {
  const count = names.length;
  Dialog.confirm({
    title: `Delete ${formatPlural(count, { one: "Tag", other: "Tags" })}`,
    description: "They will be removed from every save. This cannot be undone.",
    confirmLabel: "Delete",
    onConfirm: () => void tagOperations.deleteTags(names).then(onDone),
  });
}

export function TagsBulkActionBar({
  namesFromIds,
  clearRef,
}: {
  namesFromIds: (ids: string[]) => string[];
  clearRef: MutableRefObject<() => void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);

  async function submitDraft() {
    if (!draft) return;
    const value = draft.value.trim();
    if (!value) return;
    try {
      if (draft.kind === "merge") {
        await tagOperations.mergeTags(draft.names, value);
      } else {
        await tagOperations.create("group", value);
        await window.pond.query("tagGroups.addTags", {
          tags: draft.names,
          group: value,
        });
      }
      clearRef.current();
      setDraft(null);
    } catch (error) {
      notify({
        id: "tag-bulk",
        title:
          draft.kind === "merge"
            ? "Couldn't merge tags"
            : "Couldn't create group",
        description: errorCopy(error, "Try again."),
      });
    }
  }

  return (
    <DataTable.ActionBar className={styles["action-bar"]}>
      {(selection) => {
        const names = namesFromIds(selection.ids);
        const count = names.length;
        return (
          <>
            <span className={styles["selection-count"]}>{count} selected</span>
            <DataTable.ActionBarDivider />
            {draft ? (
              <form
                className={styles.field}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitDraft();
                }}
              >
                <Input.Root size="sm">
                  <Input.Field
                    aria-label={
                      draft.kind === "merge" ? "Target tag" : "Group name"
                    }
                    placeholder={
                      draft.kind === "merge" ? "Target tag" : "Group name"
                    }
                    value={draft.value}
                    autoFocus
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current ? { ...current, value } : current,
                      )
                    }
                  />
                </Input.Root>
                <Button size="sm" type="submit">
                  {draft.kind === "merge" ? "Merge" : "Create"}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    clearRef.current = selection.clear;
                    setDraft({ kind: "merge", names, value: "" });
                  }}
                >
                  Merge
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    clearRef.current = selection.clear;
                    setDraft({ kind: "group", names, value: "" });
                  }}
                >
                  Group
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                clearRef.current = selection.clear;
                confirmBulkDelete(names, () => clearRef.current());
              }}
            >
              Delete
            </Button>
            <Button size="sm" variant="secondary" onClick={selection.clear}>
              Clear
            </Button>
          </>
        );
      }}
    </DataTable.ActionBar>
  );
}

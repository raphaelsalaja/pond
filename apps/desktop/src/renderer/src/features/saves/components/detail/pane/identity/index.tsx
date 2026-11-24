import { mutateSave } from "@/features/saves/lib/mutate";
import type { Save } from "@/features/saves/types";
import {
  type InspectorDrafts,
  InspectorTextField,
} from "@/shared/components/inspector-text-field";
import styles from "./styles.module.css";

export function SaveIdentity({
  save,
  drafts,
  cacheKey,
}: {
  save: Save | undefined;
  drafts: InspectorDrafts;
  cacheKey: string;
}) {
  return (
    <InspectorTextField
      className={styles.title}
      drafts={drafts}
      cacheKey={`${cacheKey}:title`}
      label="Title"
      value={save ? (save.title ?? "") : null}
      multiline
      disabled={!save}
      variant="borderless"
      padding="compact"
      placeholder="Untitled"
      mixedPlaceholder="Multiple titles"
      commit={async (value) => {
        if (!save) return;
        await mutateSave(
          save.id,
          { title: value.trim() || null },
          { actorReason: "user:rename", throwOnError: true },
        );
      }}
    />
  );
}

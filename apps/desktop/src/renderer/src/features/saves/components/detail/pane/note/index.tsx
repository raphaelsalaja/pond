import { InspectorTextField } from "@/shared/components/inspector-text-field";
import type { InspectorDrafts } from "@/shared/components/inspector-text-field";
import { DetailSection } from "../detail-section";
import styles from "./styles.module.css";

export function SaveNote({
  value,
  drafts,
  cacheKey,
  commit,
}: {
  value: string | null;
  drafts: InspectorDrafts;
  cacheKey: string;
  commit: (value: string) => Promise<void>;
}) {
  return (
    <DetailSection title="Note">
      <InspectorTextField
        className={styles.field}
        drafts={drafts}
        cacheKey={cacheKey}
        label="Notes"
        value={value}
        multiline
        variant="raised"
        padding="compact"
        placeholder="Add a note"
        commit={commit}
      />
    </DetailSection>
  );
}

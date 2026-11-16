import { Chip, FileIcon } from "@pond/ui";
import type { AssistantFileAttachment } from "@shared/assistant";
import styles from "./styles.module.css";

export function FileAttachments({
  files,
  onRemove,
}: {
  files: AssistantFileAttachment[];
  onRemove?: (id: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <Chip.Root className={styles.files} aria-label="Attached files">
      {files.map((file) => (
        <Chip.Item
          key={file.id}
          kind={onRemove ? "value" : undefined}
          tone="file"
        >
          <Chip.Icon>
            <FileIcon name={file.name} />
          </Chip.Icon>
          <Chip.Label>{file.name}</Chip.Label>
          {onRemove ? (
            <Chip.Clear
              aria-label={`Remove ${file.name}`}
              onClick={() => onRemove(file.id)}
            />
          ) : null}
        </Chip.Item>
      ))}
    </Chip.Root>
  );
}

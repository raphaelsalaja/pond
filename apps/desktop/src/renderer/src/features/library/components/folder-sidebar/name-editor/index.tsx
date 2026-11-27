import { IconFolder } from "@pond/icons";
import { Sidebar } from "@pond/ui";
import type { ReactNode } from "react";
import { InlineNameEditor } from "@/shared/components/inline-name-editor";
import styles from "./styles.module.css";

export function FolderNameEditor({
  name,
  icon,
  onSave,
  onFinish,
}: {
  name: string;
  icon?: ReactNode;
  onSave: (name: string) => Promise<void>;
  onFinish: () => void;
}) {
  return (
    <div className={styles.editor}>
      <Sidebar.Icon className={styles.icon}>
        {icon ?? <IconFolder />}
      </Sidebar.Icon>
      <InlineNameEditor
        name={name}
        className={styles.field}
        ariaLabel="Folder name"
        errorTitle="Couldn't rename folder. Try again."
        onSave={onSave}
        onFinish={onFinish}
      />
    </div>
  );
}

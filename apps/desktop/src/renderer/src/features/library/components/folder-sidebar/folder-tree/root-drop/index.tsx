import { useDroppable } from "@dnd-kit/core";
import { FOLDER_ROOT_DROP_ID } from "../../folder-drop";
import styles from "./styles.module.css";

interface FolderRootDropProps {
  target: boolean;
}

export function FolderRootDrop({ target }: FolderRootDropProps) {
  const { setNodeRef } = useDroppable({ id: FOLDER_ROOT_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      aria-hidden
      className={styles.drop}
      data-folder-root-drop
      data-target={target || undefined}
    />
  );
}

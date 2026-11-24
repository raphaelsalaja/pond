import { IconDots as Dots } from "@pond/icons";
import { Menu } from "@pond/ui";
import type { MouseEvent } from "react";
import { InlineNameEditor } from "@/shared/components/inline-name-editor";
import { SpecMenu } from "@/shared/components/spec-context-menu";
import { useTagRow } from "../row-context";
import styles from "./styles.module.css";

function stop(e: MouseEvent) {
  e.stopPropagation();
}

export function NameCell({ index = false }: { index?: boolean }) {
  const { row, renaming, saveRename, finishRename } = useTagRow();
  const saves = row.kind === "tag" ? row.saves : 0;
  const name = row.kind === "tag" ? row.tag.name : row.group.name;

  return (
    <span className={styles.name} data-index={index || undefined}>
      {renaming ? (
        <InlineNameEditor
          name={name}
          className={styles.input}
          ariaLabel={row.kind === "group" ? "Group name" : "Tag name"}
          onSave={saveRename}
          onFinish={finishRename}
        />
      ) : (
        <span className={styles.text} title={name}>
          {name}
        </span>
      )}
      {!renaming && saves > 0 ? (
        <span className={styles.meta}>{index ? `(${saves})` : saves}</span>
      ) : null}
    </span>
  );
}

export function ActionsCell() {
  const { renaming, buildMenuItems } = useTagRow();
  if (renaming) {
    return null;
  }
  return (
    <SpecMenu buildItems={buildMenuItems} align="end">
      <Menu.Trigger
        icon
        size="xs"
        variant="text"
        className={styles.action}
        aria-label="More Actions"
        onClick={stop}
      >
        <Dots size={12} />
      </Menu.Trigger>
    </SpecMenu>
  );
}

import { IconCircleWarning } from "@pond/icons";
import { Badge, Sidebar } from "@pond/ui";
import type { FishSummary } from "@shared/fish-contracts";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { fishItems } from "../../lib/menu";
import { rowPreview } from "../../lib/row";
import { fish as fishStore } from "../../state/fish";
import { FishMark, fishMood } from "../mark";
import type { FishDragProps } from "../sortable";
import styles from "./styles.module.css";

export function FishTile({
  fish,
  active,
  dragProps,
}: {
  fish: FishSummary;
  active: boolean;
  dragProps?: FishDragProps;
}) {
  const mood = fishMood(fish);

  return (
    <SpecContextMenu
      search
      searchLabel="Search Fish operations"
      buildItems={() => fishItems(fish)}
    >
      <Sidebar.Tile
        {...dragProps}
        data-status={active ? "active" : undefined}
        aria-current={active ? "page" : undefined}
        aria-label={fish.name}
        aria-description={rowPreview(fish).text}
        onClick={() => fishStore.open(fish.id)}
        onDoubleClick={() => fishStore.startEditing(fish.id)}
      >
        <Sidebar.Icon>
          <FishMark
            color={fish.color}
            species={fish.species}
            activity={fish.activity}
            mood={mood}
            size={40}
          />
          {mood === "worried" ? (
            <IconCircleWarning className={styles.failed} size={12} />
          ) : null}
          {mood === "pleased" ? (
            <Badge.Dot className={styles.dot} tone="accent" />
          ) : null}
        </Sidebar.Icon>
        <Sidebar.ItemLabel>{fish.name}</Sidebar.ItemLabel>
      </Sidebar.Tile>
    </SpecContextMenu>
  );
}

import { IconDots, IconTriangleWarning } from "@pond/icons";
import { Badge, Menu, Sidebar } from "@pond/ui";
import type { FishSummary } from "@shared/fish-contracts";
import {
  SpecContextMenu,
  SpecMenu,
} from "@/shared/components/spec-context-menu";
import { fishItems } from "../../lib/menu";
import { rowPreview, rowTime, rowTimestamp } from "../../lib/row";
import { fish as fishStore } from "../../state/fish";
import { FishMark, fishMood } from "../mark";
import styles from "./styles.module.css";

export function FishRow({
  fish,
  active,
}: {
  fish: FishSummary;
  active: boolean;
}) {
  const items = () => fishItems(fish);
  const mood = fishMood(fish);
  const preview = rowPreview(fish);
  const at = fish.activity ? null : rowTimestamp(fish);

  return (
    <SpecContextMenu
      search
      searchLabel="Search Fish operations"
      buildItems={items}
    >
      <div className={styles.row}>
        <Sidebar.Item
          className={styles.item}
          data-status={active ? "active" : undefined}
          aria-current={active ? "page" : undefined}
          aria-label={fish.name}
          aria-description={preview.text}
          onClick={() => fishStore.open(fish.id)}
          onDoubleClick={() => fishStore.startEditing(fish.id)}
        >
          <Sidebar.Icon className={styles.icon}>
            <FishMark
              color={fish.color}
              species={fish.species}
              activity={fish.activity}
              mood={mood}
            />
          </Sidebar.Icon>
          <Sidebar.ItemLabel>{fish.name}</Sidebar.ItemLabel>
          {at ? (
            <time className={styles.time} dateTime={new Date(at).toISOString()}>
              {rowTime(at, new Date())}
            </time>
          ) : null}
          {mood === "worried" ? (
            <span className={styles.status}>
              <IconTriangleWarning className={styles.failed} size={12} />
            </span>
          ) : null}
          {mood === "pleased" ? (
            <span className={styles.status}>
              <Badge.Dot tone="accent" />
            </span>
          ) : null}
        </Sidebar.Item>
        <SpecMenu
          search
          searchLabel="Search Fish operations"
          align="end"
          buildItems={items}
        >
          <Menu.Trigger
            icon
            size="xs"
            variant="text"
            className={styles.more}
            aria-label={`More Actions for ${fish.name}`}
            tabIndex={-1}
          >
            <IconDots size={12} />
          </Menu.Trigger>
        </SpecMenu>
      </div>
    </SpecContextMenu>
  );
}

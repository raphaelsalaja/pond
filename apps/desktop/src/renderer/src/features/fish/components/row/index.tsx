import { IconCircleWarning, IconDots } from "@pond/icons";
import { Badge, Menu, Sidebar } from "@pond/ui";
import type { FishSummary } from "@shared/fish-contracts";
import {
  SpecContextMenu,
  SpecMenu,
} from "@/shared/components/spec-context-menu";
import { fishItems } from "../../lib/menu";
import { rowPreview, rowTime, rowTimestamp } from "../../lib/row";
import { useNow } from "../../lib/use-now";
import { fish as fishStore } from "../../state/fish";
import { FishMark, fishMood } from "../mark";
import type { FishDragProps } from "../sortable";
import styles from "./styles.module.css";

export function FishRow({
  fish,
  active,
  dragProps,
}: {
  fish: FishSummary;
  active: boolean;
  dragProps?: FishDragProps;
}) {
  const items = () => fishItems(fish);
  const mood = fishMood(fish);
  const preview = rowPreview(fish);
  const at = fish.activity ? null : rowTimestamp(fish);
  const now = useNow();

  return (
    <SpecContextMenu
      search
      searchLabel="Search Fish operations"
      buildItems={items}
    >
      <div className={styles.row} data-hover-row="">
        <Sidebar.Item
          {...dragProps}
          className={styles.item}
          size="lg"
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
              size={28}
            />
          </Sidebar.Icon>
          <Sidebar.ItemText>
            <Sidebar.ItemLabel>{fish.name}</Sidebar.ItemLabel>
            <Sidebar.ItemDetail
              className={styles.preview}
              data-tone={preview.tone}
            >
              {preview.text}
            </Sidebar.ItemDetail>
          </Sidebar.ItemText>
          {at ? (
            <time className={styles.time} dateTime={new Date(at).toISOString()}>
              {rowTime(at, now)}
            </time>
          ) : null}
          {mood === "worried" ? (
            <span className={styles.status}>
              <IconCircleWarning className={styles.failed} size={12} />
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

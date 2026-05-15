import {
  IconChevronDownOutline18,
  IconChevronLeftOutline18,
  IconChevronUpOutline18,
  IconDotsOutline18,
  IconStar2Outline18,
} from "@pond/icons/outline/18";
import { Tooltip } from "@pond/ui";
import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SourceBadge } from "@/components/source-badge";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";
import type { ListContext } from "./use-list-context";

interface HeaderProps {
  save: Save;
  list: ListContext;
}

export function DetailHeader({ save, list }: HeaderProps) {
  const navigate = useNavigate();

  const goPrev = useCallback(() => {
    if (!list.prevId) return;
    navigate(list.buildDetailPath(list.prevId));
  }, [list, navigate]);

  const goNext = useCallback(() => {
    if (!list.nextId) return;
    navigate(list.buildDetailPath(list.nextId));
  }, [list, navigate]);

  const counter =
    list.index >= 0 ? `${list.index + 1} / ${list.total}` : `— / ${list.total}`;

  return (
    <header className={styles.header}>
      <div className={styles["header-crumbs"]}>
        <Link className={styles["header-crumb-back"]} to={list.parentTo}>
          <IconChevronLeftOutline18 width={14} height={14} aria-hidden />
          <span>{list.parentLabel}</span>
        </Link>
        <span className={styles["header-crumb-sep"]} aria-hidden>
          /
        </span>
        <span className={styles["header-crumb-current"]}>
          <SourceBadge.Root source={save.source} data-size="sm" />
          <span className={styles["header-crumb-title"]}>
            {save.title ?? save.url ?? "Untitled"}
          </span>
        </span>
      </div>

      <div className={styles["header-actions"]}>
        <span
          className={styles["header-counter"]}
          role="status"
          aria-label="Position in list"
        >
          {counter}
        </span>
        <Tooltip.Root content="Previous (K)" side="bottom">
          <button
            type="button"
            className={styles["header-icon-btn"]}
            onClick={goPrev}
            disabled={!list.prevId}
            aria-label="Previous save"
          >
            <IconChevronUpOutline18 width={14} height={14} />
          </button>
        </Tooltip.Root>
        <Tooltip.Root content="Next (J)" side="bottom">
          <button
            type="button"
            className={styles["header-icon-btn"]}
            onClick={goNext}
            disabled={!list.nextId}
            aria-label="Next save"
          >
            <IconChevronDownOutline18 width={14} height={14} />
          </button>
        </Tooltip.Root>
        <Tooltip.Root content="Star" side="bottom">
          <button
            type="button"
            className={styles["header-icon-btn"]}
            aria-label="Star (coming soon)"
            disabled
          >
            <IconStar2Outline18 width={14} height={14} />
          </button>
        </Tooltip.Root>
        <Tooltip.Root content="More" side="bottom">
          <button
            type="button"
            className={styles["header-icon-btn"]}
            onClick={() => void window.pond.showSaveContextMenu(save.id)}
            aria-label="More options"
          >
            <IconDotsOutline18 width={14} height={14} />
          </button>
        </Tooltip.Root>
      </div>
    </header>
  );
}

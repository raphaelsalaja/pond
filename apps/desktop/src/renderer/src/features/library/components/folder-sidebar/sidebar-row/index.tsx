import { IconWindowDownload } from "@pond/icons";
import type { SidebarBadgeStyle } from "@pond/schema";
import { Sidebar } from "@pond/ui";
import { forwardRef } from "react";
import { formatCount } from "../counts";
import styles from "./styles.module.css";

interface RowProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof Sidebar.Item>,
    "children"
  > {
  label: string;
  active?: boolean;
  icon?: React.ReactNode;
  count?: number;
  downloading?: number;
  badgeStyle?: SidebarBadgeStyle;
  depth?: number;
  status?: React.ReactNode;
}

export const Row = forwardRef<HTMLButtonElement, RowProps>(function Row(
  {
    label,
    active,
    icon,
    count,
    downloading = 0,
    badgeStyle = "count",
    depth = 0,
    status,
    ...props
  },
  ref,
) {
  const downloadingLabel =
    downloading > 0 ? `${formatCount(downloading)} downloading` : undefined;
  return (
    <Sidebar.Item
      data-status={active ? "active" : undefined}
      data-depth={depth || undefined}
      aria-current={active ? "page" : undefined}
      ref={ref}
      {...props}
    >
      {icon ? <Sidebar.Icon>{icon}</Sidebar.Icon> : null}
      <Sidebar.ItemLabel>{label}</Sidebar.ItemLabel>
      {status != null ? (
        <Sidebar.Count>{status}</Sidebar.Count>
      ) : badgeStyle !== "none" && (count != null || downloadingLabel) ? (
        <Sidebar.Count className={styles.count} title={downloadingLabel}>
          {downloadingLabel ? (
            <>
              <IconWindowDownload size={12} aria-hidden />
              <span className={styles["sr-only"]}>{downloadingLabel}</span>
            </>
          ) : null}
          {count != null ? formatCount(count) : null}
        </Sidebar.Count>
      ) : null}
    </Sidebar.Item>
  );
});

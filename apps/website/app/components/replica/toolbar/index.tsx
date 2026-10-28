import { IconArrowLeft, IconArrowRight } from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { Button } from "@pond/ui";
import styles from "./styles.module.css";

function SidebarGlyph({ side }: { side: "left" | "right" }) {
  const x = side === "left" ? 4.75 : 13.25;
  return (
    <svg viewBox="0 0 18 18" width={18} height={18} fill="none" aria-hidden>
      <rect
        x="1.75"
        y="2.75"
        width="14.5"
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <line
        x1={x}
        x2={x}
        y1={5.75}
        y2={12.25}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface Crumb {
  label: string;
  Icon?: IconComponent;
}

interface ToolbarProps {
  crumbs?: Crumb[];
  position?: string;
  actions?: React.ReactNode;
  detailsToggle?: boolean;
}

export function Toolbar({
  crumbs = [],
  position,
  actions,
  detailsToggle,
}: ToolbarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.chrome}>
        <span className={styles.lights} aria-hidden>
          <span data-light="close" />
          <span data-light="minimize" />
          <span data-light="zoom" />
        </span>
        <Button icon size="sm" variant="ghost" aria-label="Toggle Sidebar">
          <SidebarGlyph side="left" />
        </Button>
        <div className={styles.nav}>
          <Button icon size="sm" variant="ghost" aria-label="Back">
            <IconArrowLeft />
          </Button>
          <Button icon size="sm" variant="ghost" aria-label="Forward" disabled>
            <IconArrowRight />
          </Button>
        </div>
      </div>
      <div className={styles.main}>
        <ol className={styles.trail}>
          {crumbs.map((crumb, index) => {
            const current = index === crumbs.length - 1;
            return (
              <li key={crumb.label} className={styles.segment}>
                {index > 0 ? (
                  <span className={styles.separator} aria-hidden>
                    /
                  </span>
                ) : null}
                <span
                  className={styles.crumb}
                  data-current={current || undefined}
                >
                  {crumb.Icon ? <crumb.Icon aria-hidden /> : null}
                  <span className={styles.label}>{crumb.label}</span>
                  {current && position ? (
                    <span className={styles.position}>{position}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {actions || detailsToggle ? (
        <div className={styles.actions}>
          {actions}
          {detailsToggle ? (
            <Button icon size="sm" variant="ghost" aria-label="Toggle Details">
              <SidebarGlyph side="right" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

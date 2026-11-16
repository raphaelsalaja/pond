import { IconTriangleWarning } from "@pond/icons";
import { Button, Reveal } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function ErrorNotice({
  title = "Couldn't finish this response",
  children,
  onRetry,
  actions,
  className,
}: {
  title?: string;
  children?: ReactNode;
  onRetry?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Reveal>
      <div className={cn(styles.notice, className)} role="alert">
        <IconTriangleWarning size={16} className={styles.icon} />
        <div className={styles.content}>
          <span className={styles.title}>{title}</span>
          {children ? (
            <span className={styles.description}>{children}</span>
          ) : null}
        </div>
        {onRetry || actions ? (
          <div className={styles.actions}>
            {actions}
            {onRetry ? (
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}

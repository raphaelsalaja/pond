import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import type { NotificationTone } from "../notification-icon";
import styles from "./styles.module.css";

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  ref?: React.Ref<HTMLDivElement>;
}

function Root({ className, children, ...props }: RootProps) {
  return (
    <div
      className={cn(styles.page, className)}
      tabIndex={-1}
      data-scroll-fade="vertical"
      {...props}
    >
      <div className={styles.column}>{children}</div>
    </div>
  );
}

interface HeaderProps extends ComponentPropsWithoutRef<"header"> {
  tone?: NotificationTone;
}

function Header({ tone, className, ...props }: HeaderProps) {
  return (
    <header className={cn(styles.head, className)} data-tone={tone} {...props} />
  );
}

function Icon({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn(styles.icon, className)} {...props} />;
}

function Title({ className, ...props }: ComponentPropsWithoutRef<"h2">) {
  return <h2 className={cn(styles.title, className)} {...props} />;
}

interface TimeProps extends ComponentPropsWithoutRef<"time"> {
  at: number;
}

function Time({ at, className, ...props }: TimeProps) {
  return (
    <time
      className={cn(styles.time, className)}
      dateTime={new Date(at).toISOString()}
      {...props}
    >
      {relativeTimeFromMs(at)}
    </time>
  );
}

function Summary({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn(styles.summary, className)} {...props} />;
}

function Status({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn(styles.status, className)} {...props} />;
}

function Actions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

export const Detail = {
  Root,
  Header,
  Icon,
  Title,
  Time,
  Summary,
  Status,
  Actions,
};

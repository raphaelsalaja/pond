import { clsx as cn } from "clsx";
import { useReducedMotionConfig } from "motion/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ActionBar } from "./message-actions";
import styles from "./styles.module.css";

type Sender = "user" | "assistant" | "system";

interface RootProps extends ComponentPropsWithoutRef<"article"> {
  from: Sender;
}

function Root({ className, from, ...props }: RootProps) {
  const reduced = useReducedMotionConfig();
  return (
    <article
      {...props}
      data-reduced-motion={reduced || undefined}
      data-from={from}
      className={cn(styles.message, className)}
    />
  );
}

function Body({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.body, className)} {...props} />;
}

function Bubble({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      data-slot="message-bubble"
      className={cn(styles.bubble, className)}
      {...props}
    />
  );
}

function Leading({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className={styles.leading}>{children}</div>;
}

function Footer({ children }: { children?: ReactNode }) {
  return children ? children : null;
}

function Actions({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className={styles.actions}>{children}</div>;
}

function View({
  from,
  leading,
  footer,
  actions,
  children,
  animateEntrance = false,
}: {
  from: Sender;
  leading?: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  animateEntrance?: boolean;
}) {
  return (
    <Root from={from} data-enter={animateEntrance || undefined}>
      <Leading>{leading}</Leading>
      <div className={styles.body}>
        {children}
        <Footer>{footer}</Footer>
      </div>
      <Actions>{actions}</Actions>
    </Root>
  );
}

export const Message = {
  Root,
  Body,
  Bubble,
  Leading,
  Footer,
  Actions,
  View,
  ActionBar,
};

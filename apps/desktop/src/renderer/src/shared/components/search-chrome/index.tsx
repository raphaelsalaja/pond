import { IconMagnifier } from "@pond/icons";
import { Input as Base } from "@pond/ui";
import { clsx as cn } from "clsx";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePageToolbarHost } from "@/shared/state/page-toolbar";
import styles from "./styles.module.css";

interface RootProps {
  children?: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
}

function Root({ children, actions, below }: RootProps) {
  const host = usePageToolbarHost();
  const bar = (
    <Bar>
      {children}
      {actions ? <Actions>{actions}</Actions> : null}
    </Bar>
  );
  return (
    <>
      {host ? createPortal(bar, host) : bar}
      {below ? <div className={styles.below}>{below}</div> : null}
    </>
  );
}

interface BarProps extends ComponentPropsWithoutRef<"div"> {}

function Bar({ className, ...props }: BarProps) {
  return <div className={cn(styles.bar, className)} {...props} />;
}

interface ActionsProps extends ComponentPropsWithoutRef<"div"> {}

function Actions({ className, ...props }: ActionsProps) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

interface ShellProps {
  children?: ReactNode;
  className?: string;
}

function Shell({ children, className }: ShellProps) {
  return (
    <Base.Root
      size="sm"
      variant="borderless"
      rounding="full"
      className={cn(styles.shell, className)}
    >
      <Base.Icon className={styles.lens}>
        <IconMagnifier size={14} />
      </Base.Icon>
      {children}
    </Base.Root>
  );
}

const Field = forwardRef<
  HTMLInputElement,
  ComponentPropsWithoutRef<typeof Base.Field>
>(function Field(props, ref) {
  return (
    <Shell>
      <Base.Field
        ref={ref}
        spellCheck={false}
        placeholder="Search…"
        {...props}
      />
    </Shell>
  );
});

interface InputProps extends ComponentPropsWithoutRef<typeof Base.Field> {
  variant?: "primary" | "secondary" | "borderless";
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, variant = "borderless", ...props },
  ref,
) {
  return (
    <Base.Root
      className={cn(styles.input, className)}
      size="md"
      variant={variant}
    >
      <Base.Field
        ref={ref}
        className={styles.field}
        appearance={variant === "borderless" ? "bare" : undefined}
        {...props}
      />
    </Base.Root>
  );
});

export const SearchChrome = { Root, Bar, Actions, Shell, Field, Input };

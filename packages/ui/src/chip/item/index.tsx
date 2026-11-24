import { IconXmark } from "@pond/icons";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import { Button, type ButtonProps } from "../../button";
import styles from "./styles.module.css";

export type ChipTone =
  | "mention"
  | "tag"
  | "added"
  | "removed"
  | "applied"
  | "suggested"
  | "file";

interface ItemProps extends ComponentPropsWithoutRef<"div"> {
  kind?: "field" | "value";
  tone?: ChipTone;
  selected?: boolean;
}

export function Item({ className, kind, tone, selected, ...props }: ItemProps) {
  return (
    <div
      className={cn(styles.item, className)}
      data-kind={kind === "value" ? "value" : undefined}
      data-tone={tone}
      data-selected={selected || undefined}
      {...props}
    />
  );
}

interface ActionProps extends ComponentPropsWithoutRef<"button"> {
  tone: Extract<ChipTone, "applied" | "suggested" | "mention">;
  icon?: boolean;
}

export function Action({
  className,
  tone,
  icon,
  type = "button",
  ...props
}: ActionProps) {
  return (
    <button
      type={type}
      className={cn(styles.action, className)}
      data-tone={tone}
      data-icon={icon || undefined}
      {...props}
    />
  );
}

interface LinkProps extends ComponentPropsWithoutRef<"a"> {
  tone?: Extract<ChipTone, "file">;
}

export function Link({ className, tone = "file", ...props }: LinkProps) {
  return (
    <a className={cn(styles.link, className)} data-tone={tone} {...props} />
  );
}

interface ClearProps extends Omit<ButtonProps, "icon"> {}

export function Clear({
  className,
  children,
  "aria-label": ariaLabel = "Remove",
  ...props
}: ClearProps) {
  return (
    <Button
      icon
      size="xs"
      variant="ghost"
      aria-label={ariaLabel}
      className={cn(styles.clear, className)}
      {...props}
    >
      {children ?? <IconXmark size={12} />}
    </Button>
  );
}

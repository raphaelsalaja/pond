import { Input as Base } from "@base-ui/react/input";
import { clsx as cn } from "clsx";
import { forwardRef } from "react";
import { stopPageHotkeys } from "../stop-page-hotkeys";
import styles from "./styles.module.css";

type InputSize = "xs" | "sm" | "md";
type InputVariant = "primary" | "secondary" | "borderless";
/** `bare` drops the field chrome for inline editors that must match the text they replace. */
type FieldAppearance = "default" | "bare";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  size?: InputSize;
  variant?: InputVariant;
}

function Root({
  className,
  size = "md",
  variant = "primary",
  ...props
}: RootProps) {
  return (
    <div
      data-slot="root"
      data-size={size}
      data-variant={variant}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

interface IconProps extends React.ComponentPropsWithoutRef<"span"> {}

function Icon({ className, ...props }: IconProps) {
  return (
    <span
      data-slot="icon"
      aria-hidden="true"
      className={cn(styles.icon, className)}
      {...props}
    />
  );
}

interface SlotProps extends React.ComponentPropsWithoutRef<"div"> {}

function Action({ className, ...props }: SlotProps) {
  return (
    <div
      data-slot="action"
      className={cn(styles.action, className)}
      {...props}
    />
  );
}

function Prefix({ className, ...props }: SlotProps) {
  return (
    <div
      data-slot="prefix"
      className={cn(styles.affix, className)}
      {...props}
    />
  );
}

function Suffix({ className, ...props }: SlotProps) {
  return (
    <div
      data-slot="suffix"
      className={cn(styles.affix, className)}
      {...props}
    />
  );
}

const Field = forwardRef<
  HTMLInputElement,
  Base.Props & { appearance?: FieldAppearance }
>(function Field({ className, appearance, onKeyDown, ...props }, ref) {
  return (
    <Base
      {...props}
      ref={ref}
      data-slot="field"
      data-appearance={appearance === "bare" ? appearance : undefined}
      className={cn(styles.field, className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        stopPageHotkeys(event);
      }}
    />
  );
});

interface TextareaProps extends React.ComponentPropsWithoutRef<"textarea"> {
  onValueChange?: (value: string) => void;
  /** `compact` sizes one line to the single-line field height of the same `size`. */
  padding?: "default" | "comfortable" | "compact";
  /** `content` grows the field with its text instead of holding `rows`. */
  sizing?: "rows" | "content";
  appearance?: FieldAppearance;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      className,
      appearance,
      rows = 5,
      onChange,
      onValueChange,
      onKeyDown,
      padding,
      sizing,
      ...props
    },
    ref,
  ) {
    return (
      <textarea
        {...props}
        ref={ref}
        data-slot="field"
        data-multiline
        data-padding={padding === "default" ? undefined : padding}
        data-sizing={sizing === "content" ? sizing : undefined}
        data-appearance={appearance === "bare" ? appearance : undefined}
        rows={rows}
        className={cn(styles.field, className)}
        onChange={(event) => {
          onChange?.(event);
          onValueChange?.(event.target.value);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          stopPageHotkeys(event);
        }}
      />
    );
  },
);

export const Input = {
  Root,
  Prefix,
  Suffix,
  Icon,
  Action,
  Field,
  Textarea,
};

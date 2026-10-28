import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {}

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

interface SectionProps extends React.ComponentPropsWithoutRef<"section"> {
  tone?: "plain" | "muted" | "dark";
  spacing?: "none" | "sm" | "md" | "lg" | "xl";
  inset?: "default" | "none";
}

function Section({
  className,
  tone = "plain",
  spacing = "md",
  inset = "default",
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(styles.section, className)}
      data-tone={tone}
      data-spacing={spacing}
      data-inset={inset === "none" ? "none" : undefined}
      data-theme={tone === "dark" ? "dark" : undefined}
      {...props}
    />
  );
}

interface LabelProps extends React.ComponentPropsWithoutRef<"p"> {}

function Label({ className, ...props }: LabelProps) {
  return <p className={cn(styles.label, className)} {...props} />;
}

export const Frame = { Root, Section, Label };

import { cn } from "@pond/ui";
import type { ReactNode } from "react";
import type { LibraryCardView } from "@/features/saves";
import styles from "./styles.module.css";

type GridLayout = LibraryCardView;

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

function Root({ className, style, children, ...props }: RootProps) {
  return (
    <div className={cn(styles.root, className)} style={style} {...props}>
      {children}
    </div>
  );
}

interface GridProps extends React.ComponentPropsWithRef<"ul"> {
  layout?: GridLayout;
  multiSelect?: boolean;
}

function Grid({
  layout = "grid",
  multiSelect,
  className,
  ...props
}: GridProps) {
  return (
    <ul
      className={cn(styles.grid, className)}
      data-layout={layout}
      data-multi-select={multiSelect ? "true" : undefined}
      {...props}
    />
  );
}

interface SectionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Sections({ className, ...props }: SectionsProps) {
  return <div className={cn(styles.sections, className)} {...props} />;
}

interface DividerProps extends React.ComponentPropsWithRef<"div"> {}

function Divider({ className, ...props }: DividerProps) {
  return <div className={cn(styles.divider, className)} {...props} />;
}

export const LibraryGrid = {
  Root,
  Grid,
  Sections,
  Divider,
};

export type { GridLayout };

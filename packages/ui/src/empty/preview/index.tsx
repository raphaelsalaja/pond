import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type Shape = "row" | "tile" | "chip" | "panel" | "field" | "board";
type Layout = "stack" | "single" | "spread" | "list";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  shape?: Shape;
  layout?: Layout;
}

/** Ghost cards shaped like the thing that will land here: stacked, alone, side by side or listed. */
function Root({
  shape = "row",
  layout = "stack",
  className,
  children,
  ...props
}: RootProps) {
  return (
    <div
      className={cn(styles.root, className)}
      data-shape={shape}
      data-layout={layout}
      {...props}
    >
      {layout === "stack" ? (
        <>
          <span className={styles.card} data-layer="3" />
          <span className={styles.card} data-layer="2" />
          <span className={styles.card} data-layer="1">
            {children}
          </span>
        </>
      ) : layout === "single" ? (
        <span className={styles.card} data-layer="1">
          {children}
        </span>
      ) : (
        <>
          <span className={styles.card} data-layer="1">
            {children}
          </span>
          <span className={styles.card} data-layer="2">
            {children}
          </span>
          <span className={styles.card} data-layer="3">
            {children}
          </span>
        </>
      )}
    </div>
  );
}

interface RowProps extends React.ComponentPropsWithoutRef<"span"> {}

function Row({ className, ...props }: RowProps) {
  return <span className={cn(styles.row, className)} {...props} />;
}

interface ColumnProps extends React.ComponentPropsWithoutRef<"span"> {}

function Column({ className, ...props }: ColumnProps) {
  return <span className={cn(styles.column, className)} {...props} />;
}

interface LineProps extends React.ComponentPropsWithoutRef<"i"> {
  width: number;
  tone?: "mid" | "light" | "thin";
}

function Line({ width, tone, className, style, ...props }: LineProps) {
  return (
    <i
      className={cn(styles.line, className)}
      data-tone={tone}
      style={{ ...style, "--preview-width": `${width}px` } as React.CSSProperties}
      {...props}
    />
  );
}

interface LinesProps extends React.ComponentPropsWithoutRef<"span"> {}

function Lines({ className, ...props }: LinesProps) {
  return <span className={cn(styles.lines, className)} {...props} />;
}

function Space() {
  return <span className={styles.space} />;
}

interface ThumbProps extends React.ComponentPropsWithoutRef<"i"> {
  shape?: "round";
}

function Thumb({ shape, className, ...props }: ThumbProps) {
  return <i className={cn(styles.thumb, className)} data-shape={shape} {...props} />;
}

interface BlockProps extends React.ComponentPropsWithoutRef<"span"> {
  height?: number;
}

/** Fills the card's width, or the leftover height when no height is given. */
function Block({ height, className, style, ...props }: BlockProps) {
  return (
    <span
      className={cn(styles.block, className)}
      data-fill={height ? undefined : true}
      style={{ ...style, "--preview-height": height ? `${height}px` : undefined } as React.CSSProperties}
      {...props}
    />
  );
}

interface IconProps extends React.ComponentPropsWithoutRef<"span"> {}

function Icon({ className, ...props }: IconProps) {
  return <span className={cn(styles.icon, className)} {...props} />;
}

interface ChipsProps extends React.ComponentPropsWithoutRef<"span"> {
  widths: number[];
}

function Chips({ widths, className, ...props }: ChipsProps) {
  return (
    <span className={cn(styles.chips, className)} {...props}>
      {widths.map((width, index) => (
        <i
          key={index}
          className={styles.chip}
          style={{ "--preview-width": `${width}px` } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

export const EmptyPreview = {
  Root,
  Row,
  Column,
  Line,
  Lines,
  Space,
  Thumb,
  Block,
  Icon,
  Chips,
};

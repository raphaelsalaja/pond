import { clsx as cn } from "clsx";
import { cssVars } from "../../css-vars";
import styles from "./styles.module.css";

type Kind = "row" | "tile" | "chip" | "panel" | "field" | "board";
type Layout = "stack" | "single" | "spread" | "list";

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  kind?: Kind;
  layout?: Layout;
}

/** Ghost cards shaped like the thing that will land here: stacked, alone, side by side or listed. */
function Root({
  kind = "row",
  layout = "stack",
  className,
  children,
  ...props
}: RootProps) {
  return (
    <div
      className={cn(styles.root, className)}
      data-kind={kind}
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

type RowProps = React.ComponentPropsWithoutRef<"span">;

function Row({ className, ...props }: RowProps) {
  return <span className={cn(styles.row, className)} {...props} />;
}

type ColumnProps = React.ComponentPropsWithoutRef<"span">;

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
      style={
        /** SAFETY: React forwards custom properties, but `CSSProperties` has no `--*` keys. */
        { ...style, "--preview-width": `${width}px` } as React.CSSProperties
      }
      {...props}
    />
  );
}

type LinesProps = React.ComponentPropsWithoutRef<"span">;

function Lines({ className, ...props }: LinesProps) {
  return <span className={cn(styles.lines, className)} {...props} />;
}

function Space() {
  return <span className={styles.space} />;
}

interface ThumbProps extends React.ComponentPropsWithoutRef<"i"> {
  variant?: "round";
}

function Thumb({ variant, className, ...props }: ThumbProps) {
  return (
    <i
      className={cn(styles.thumb, className)}
      data-variant={variant}
      {...props}
    />
  );
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
      style={
        /** SAFETY: React forwards custom properties, but `CSSProperties` has no `--*` keys. */
        {
          ...style,
          "--preview-height": height ? `${height}px` : undefined,
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

type IconProps = React.ComponentPropsWithoutRef<"span">;

function Icon({ className, ...props }: IconProps) {
  return <span className={cn(styles.icon, className)} {...props} />;
}

interface ChipsProps extends React.ComponentPropsWithoutRef<"span"> {
  widths: Array<number>;
}

function Chips({ widths, className, ...props }: ChipsProps) {
  const seen = new Map<number, number>();
  return (
    <span className={cn(styles.chips, className)} {...props}>
      {widths.map((width) => {
        const repeat = (seen.get(width) ?? 0) + 1;
        seen.set(width, repeat);
        return (
          <i
            key={`${width}-${repeat}`}
            className={styles.chip}
            style={cssVars({ "--preview-width": `${width}px` })}
          />
        );
      })}
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

import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

/** Punctuation keys that read as glued to a modifier unless we insert "then". */
const THEN_KEYS = new Set([",", ".", "/", ";", "=", "-", "[", "]", "\\"]);

type Density = "default" | "inline" | "flat";

interface ClusterProps {
  keys: Array<string>;
  separator?: string;
  density?: Density;
  className?: string;
}

function clusterSeparator(keys: Array<string>): string {
  const last = keys.at(-1);
  return last !== undefined && THEN_KEYS.has(last) ? "then" : "";
}

function Cluster({
  keys,
  separator,
  density = "default",
  className,
}: ClusterProps) {
  const gap = separator !== undefined ? separator : clusterSeparator(keys);
  return (
    <span
      className={cn(styles.cluster, className)}
      data-density={density === "default" ? undefined : density}
      aria-hidden
    >
      {keys.map((k, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- short, immutable lists; duplicate keys are valid (e.g. `⌘ ⌘`)
        <span key={`${i}-${k}`} className={styles.row}>
          {i > 0 && gap ? (
            <span className={styles.separator}>{gap}</span>
          ) : null}
          <Key
            density={density}
            data-glyph={Array.from(k).length === 1 || undefined}
          >
            {k}
          </Key>
        </span>
      ))}
    </span>
  );
}

interface KeyProps extends React.ComponentPropsWithoutRef<"kbd"> {
  density?: Density;
}

function Key({ density = "default", className, ...props }: KeyProps) {
  return (
    <kbd
      data-density={density === "default" ? undefined : density}
      className={cn(styles.key, className)}
      {...props}
    />
  );
}

export interface ShortcutProps extends Omit<
  React.ComponentPropsWithoutRef<"span">,
  "children"
> {
  children?: string | Array<string>;
  density?: Density;
}

function Shortcut({
  className,
  children,
  density = "default",
  ...props
}: ShortcutProps) {
  const keys = Array.isArray(children)
    ? children
    : children
      ? [children]
      : null;
  return (
    <span className={className} {...props}>
      {keys ? <Cluster keys={keys} density={density} /> : children}
    </span>
  );
}

export const Keyboard = {
  Cluster,
  Key,
  Shortcut,
};

import { cn } from "@pond/ui";
import styles from "./styles.module.css";

const HUES = [
  "red",
  "orange",
  "gold",
  "yellow",
  "lime",
  "green",
  "jade",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "magenta",
  "pink",
];

export function Palette({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"ol">) {
  return (
    <ol className={cn(styles.list, className)} {...props}>
      {HUES.map((hue) => (
        <li key={hue} className={styles.hue} title={`--ds-${hue}`}>
          <span
            className={styles.dot}
            style={{ background: `var(--ds-${hue})` }}
          />
          <span className={styles.name}>{hue}</span>
        </li>
      ))}
    </ol>
  );
}

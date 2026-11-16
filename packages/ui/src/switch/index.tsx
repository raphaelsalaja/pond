import { Switch as Base } from "@base-ui/react/switch";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

function Root({ className, children, ...props }: Base.Root.Props) {
  return (
    <Base.Root className={cn(styles.root, className)} {...props}>
      {children ?? <Thumb />}
    </Base.Root>
  );
}

function Thumb({ className, ...props }: Base.Thumb.Props) {
  return <Base.Thumb className={cn(styles.thumb, className)} {...props} />;
}

interface MarkProps extends React.ComponentPropsWithoutRef<"span"> {
  checked?: boolean;
}

/** The track without a control, for rows like `menuitemcheckbox` that are the switch themselves. */
function Mark({ checked = false, className, ...props }: MarkProps) {
  const state = checked ? { "data-checked": "" } : { "data-unchecked": "" };
  return (
    <span
      aria-hidden
      {...state}
      className={cn(styles.root, className)}
      {...props}
    >
      <span {...state} className={styles.thumb} />
    </span>
  );
}

export const Switch = {
  Root,
  Thumb,
  Mark,
};

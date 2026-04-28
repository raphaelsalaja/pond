import { Collapsible as Base } from "@base-ui-components/react/collapsible";
import styles from "./collapsible.module.css";

/**
 * Show/hide a panel triggered by a button. Mirrors `<details>`/`<summary>`
 * but with full keyboard support, animation hooks, and a controllable
 * `open` prop.
 */
export function Collapsible(props: React.ComponentProps<typeof Base.Root>) {
  return <Base.Root {...props} />;
}

export function CollapsibleTrigger({
  className,
  ...rest
}: React.ComponentProps<typeof Base.Trigger>) {
  return (
    <Base.Trigger
      className={[styles.trigger, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function CollapsiblePanel({
  className,
  ...rest
}: React.ComponentProps<typeof Base.Panel>) {
  return (
    <Base.Panel
      className={[styles.panel, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

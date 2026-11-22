import { Tabs as Base } from "@base-ui/react/tabs";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

function Root({ className, ...props }: Base.Root.Props) {
  return <Base.Root className={cn(styles.root, className)} {...props} />;
}

interface ListProps extends Base.List.Props {
  /** `secondary` raises the active tab like a secondary Button. */
  variant?: "default" | "secondary";
}

function List({ className, variant = "default", ...props }: ListProps) {
  return (
    <Base.List
      className={cn(styles.list, className)}
      data-variant={variant === "default" ? undefined : variant}
      {...props}
    />
  );
}

interface TabProps extends Base.Tab.Props {
  icon?: boolean;
}

function Tab({ className, icon, ...props }: TabProps) {
  return (
    <Base.Tab
      className={cn(styles.tab, className)}
      data-icon={icon || undefined}
      {...props}
    />
  );
}

function Panel({ className, ...props }: Base.Panel.Props) {
  return <Base.Panel className={cn(styles.panel, className)} {...props} />;
}

function Indicator({ className, ...props }: Base.Indicator.Props) {
  return (
    <Base.Indicator className={cn(styles.indicator, className)} {...props} />
  );
}

export const Tabs = { Root, List, Tab, Panel, Indicator };
export type { TabProps };

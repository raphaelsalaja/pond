import { Collapsible as Base } from "@base-ui/react/collapsible";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

function Trigger({ className, ...props }: Base.Trigger.Props) {
  return <Base.Trigger className={cn(styles.trigger, className)} {...props} />;
}

function Panel({ className, ...props }: Base.Panel.Props) {
  return <Base.Panel className={cn(styles.panel, className)} {...props} />;
}

export const Collapsible = {
  Root,
  Trigger,
  Panel,
};

import { Collapsible as Base } from "@base-ui/react/collapsible";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ ...props }: RootProps) {
  return <Base.Root {...props} />;
}

interface TriggerProps extends React.ComponentProps<typeof Base.Trigger> {}

function Trigger({ className, ...props }: TriggerProps) {
  return (
    <Base.Trigger
      className={[styles.trigger, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface PanelProps extends React.ComponentProps<typeof Base.Panel> {}

function Panel({ className, ...props }: PanelProps) {
  return (
    <Base.Panel
      className={[styles.panel, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Collapsible = {
  Root,
  Trigger,
  Panel,
};

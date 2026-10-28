import { clsx as cn } from "clsx";
import { Frame } from "../frame";
import { Replica, type ReplicaScene, type ReplicaSelection } from "../replica";
import styles from "./styles.module.css";

interface PanelProps {
  scene?: ReplicaScene;
  selected?: ReplicaSelection;
  label?: string;
  crop?: "none" | "top-start" | "top-end" | "bottom-end";
  className?: string;
}

/** The replica on a soft panel; a `crop` zooms in on one corner of the window. */
function Panel({
  scene,
  selected,
  label,
  crop = "none",
  className,
}: PanelProps) {
  return (
    <div
      className={cn(styles.panel, className)}
      data-crop={crop === "none" ? undefined : crop}
    >
      <Replica
        className={styles.replica}
        scene={scene}
        selected={selected}
        label={label}
      />
    </div>
  );
}

interface RootProps extends Omit<PanelProps, "crop"> {}

function Root({ className, ...props }: RootProps) {
  return (
    <Frame.Section spacing="none" className={className}>
      <Panel {...props} />
    </Frame.Section>
  );
}

export const Showcase = { Root, Panel };

import { Tooltip as Base } from "@base-ui/react/tooltip";
import { renderFrozenPopup } from "../freeze/popup";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

function Provider(props: Base.Provider.Props) {
  return <Base.Provider {...props} />;
}

function Trigger(props: Base.Trigger.Props) {
  return <Base.Trigger {...props} />;
}

function Portal(props: Base.Portal.Props) {
  return <Base.Portal {...props} />;
}

function Viewport(props: Base.Viewport.Props) {
  return <Base.Viewport {...props} />;
}

function Positioner({
  className,
  sideOffset = 16,
  ...props
}: Base.Positioner.Props) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      className={cn(styles.positioner, className)}
      {...props}
    />
  );
}

function Popup({ className, render, ...props }: Base.Popup.Props) {
  return (
    <Base.Popup
      {...props}
      className={cn(styles.popup, className)}
      render={render ?? renderFrozenPopup}
    />
  );
}

function Arrow({ className, ...props }: Base.Arrow.Props) {
  return (
    <Base.Arrow className={cn(styles.arrow, className)} {...props}>
      <div data-side="left" className={styles.curve} />
      <div data-side="right" className={styles.curve} />
    </Base.Arrow>
  );
}

export const Tooltip = {
  Root,
  Provider,
  Trigger,
  Portal,
  Positioner,
  Popup,
  Arrow,
  Viewport,
  createHandle: Base.createHandle,
  Handle: Base.Handle,
};

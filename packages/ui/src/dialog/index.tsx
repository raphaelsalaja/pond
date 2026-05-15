import { Dialog as Base } from "@base-ui/react/dialog";
import { renderFrozenPopup } from "../freeze/popup";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

type DialogSize = "default" | "fullscreen";

interface ContentProps extends Base.Popup.Props {
  "data-size"?: DialogSize;
}

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

function Trigger(props: Base.Trigger.Props) {
  return <Base.Trigger {...props} />;
}

function Close(props: Base.Close.Props) {
  return <Base.Close {...props} />;
}

function Content({ className, children, render, ...rest }: ContentProps) {
  return (
    <Base.Portal>
      <Base.Backdrop className={styles.backdrop} />
      <Base.Popup
        {...rest}
        className={cn(styles.popup, className)}
        render={render ?? renderFrozenPopup}
      >
        {children}
      </Base.Popup>
    </Base.Portal>
  );
}

function Title({ className, ...props }: Base.Title.Props) {
  return <Base.Title className={cn(styles.title, className)} {...props} />;
}

function Description({ className, ...props }: Base.Description.Props) {
  return (
    <Base.Description
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

export const Dialog = {
  Root,
  Trigger,
  Content,
  Title,
  Description,
  Close,
};

import { AlertDialog as Base } from "@base-ui/react/alert-dialog";
import dialogStyles from "../dialog/styles.module.css";
import { renderFrozenPopup } from "../freeze/popup";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root(props: Base.Root.Props) {
  return <Base.Root {...props} />;
}

function Trigger(props: Base.Trigger.Props) {
  return <Base.Trigger {...props} />;
}

function Close(props: Base.Close.Props) {
  return <Base.Close {...props} />;
}

function Content({ className, children, render, ...rest }: Base.Popup.Props) {
  return (
    <Base.Portal>
      <Base.Backdrop className={dialogStyles.backdrop} />
      <Base.Popup
        {...rest}
        className={cn(dialogStyles.popup, className)}
        render={render ?? renderFrozenPopup}
      >
        {children}
      </Base.Popup>
    </Base.Portal>
  );
}

function Title({ className, ...props }: Base.Title.Props) {
  return (
    <Base.Title className={cn(dialogStyles.title, className)} {...props} />
  );
}

function Description({ className, ...props }: Base.Description.Props) {
  return (
    <Base.Description
      className={cn(dialogStyles.description, className)}
      {...props}
    />
  );
}

function Actions({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(styles.actions, className)} {...props} />;
}

export const AlertDialog = {
  Root,
  Trigger,
  Content,
  Title,
  Description,
  Actions,
  Close,
};

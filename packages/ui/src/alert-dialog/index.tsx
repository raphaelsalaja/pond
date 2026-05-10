import { AlertDialog as Base } from "@base-ui/react/alert-dialog";
import type { ReactNode } from "react";
import dialogStyles from "../dialog/styles.module.css";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ ...props }: RootProps) {
  return <Base.Root {...props} />;
}

interface TriggerProps extends React.ComponentProps<typeof Base.Trigger> {}

function Trigger({ ...props }: TriggerProps) {
  return <Base.Trigger {...props} />;
}

interface CloseProps extends React.ComponentProps<typeof Base.Close> {}

function Close({ ...props }: CloseProps) {
  return <Base.Close {...props} />;
}

interface ContentProps extends React.ComponentProps<typeof Base.Popup> {
  children?: ReactNode;
}

function Content({ className, children, ...rest }: ContentProps) {
  return (
    <Base.Portal>
      <Base.Backdrop className={dialogStyles.backdrop} />
      <Base.Popup
        className={[dialogStyles.popup, className ?? ""]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </Base.Popup>
    </Base.Portal>
  );
}

interface TitleProps extends React.ComponentProps<typeof Base.Title> {}

function Title({ className, ...props }: TitleProps) {
  return (
    <Base.Title
      className={[dialogStyles.title, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface DescriptionProps
  extends React.ComponentProps<typeof Base.Description> {}

function Description({ className, ...props }: DescriptionProps) {
  return (
    <Base.Description
      className={[dialogStyles.description, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ActionsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Actions({ className, ...props }: ActionsProps) {
  return (
    <div
      className={[styles.actions, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
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

import { Dialog as Base } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
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

type DialogSize = "default" | "fullscreen";

interface ContentProps extends React.ComponentProps<typeof Base.Popup> {
  children?: ReactNode;
  "data-size"?: DialogSize;
}

function Content({ className, children, ...rest }: ContentProps) {
  return (
    <Base.Portal>
      <Base.Backdrop className={styles.backdrop} />
      <Base.Popup
        className={[styles.popup, className ?? ""].filter(Boolean).join(" ")}
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
      className={[styles.title, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface DescriptionProps
  extends React.ComponentProps<typeof Base.Description> {}

function Description({ className, ...props }: DescriptionProps) {
  return (
    <Base.Description
      className={[styles.description, className ?? ""]
        .filter(Boolean)
        .join(" ")}
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

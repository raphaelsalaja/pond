import { Dialog as Base } from "@base-ui-components/react/dialog";
import type { ReactNode } from "react";
import styles from "./dialog.module.css";

/**
 * Generic modal dialog. Use for non-confirmation surfaces (lightboxes,
 * forms, settings sheets). For destructive confirmations prefer
 * `<AlertDialog>` — it announces with `role="alertdialog"` so screen
 * readers handle it differently.
 */
export function Dialog(props: React.ComponentProps<typeof Base.Root>) {
  return <Base.Root {...props} />;
}

export const DialogTrigger = Base.Trigger;
export const DialogClose = Base.Close;

interface ContentProps extends React.ComponentProps<typeof Base.Popup> {
  children?: ReactNode;
  /** Visual size — `default` is centred 420px card, `fullscreen` fills the viewport. */
  size?: "default" | "fullscreen";
}

export function DialogContent({
  className,
  children,
  size = "default",
  ...rest
}: ContentProps) {
  return (
    <Base.Portal>
      <Base.Backdrop className={styles.backdrop} />
      <Base.Popup
        className={[
          styles.popup,
          size === "fullscreen" ? styles["popup-fullscreen"] : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </Base.Popup>
    </Base.Portal>
  );
}

export function DialogTitle(props: React.ComponentProps<typeof Base.Title>) {
  const { className, ...rest } = props;
  return (
    <Base.Title
      className={[styles.title, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function DialogDescription(
  props: React.ComponentProps<typeof Base.Description>,
) {
  const { className, ...rest } = props;
  return (
    <Base.Description
      className={[styles.description, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

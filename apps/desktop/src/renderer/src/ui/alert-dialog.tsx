import { AlertDialog as Base } from "@base-ui-components/react/alert-dialog";
import type { ReactNode } from "react";
import styles from "./dialog.module.css";

/**
 * AlertDialog — destructive / blocking confirmation. Replaces
 * `window.confirm` and friends.
 *
 * Composition mirrors Base UI:
 *   <AlertDialog>
 *     <AlertDialogTrigger>…</AlertDialogTrigger>
 *     <AlertDialogContent>
 *       <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
 *       <AlertDialogDescription>This cannot be undone.</…>
 *       <AlertDialogActions>
 *         <AlertDialogClose>Cancel</…>
 *         <AlertDialogClose render={<Button variant="danger" …/>}>
 *           Delete forever
 *         </AlertDialogClose>
 *       </AlertDialogActions>
 *     </AlertDialogContent>
 *   </AlertDialog>
 *
 * Trigger/Content/Close all forward to Base primitives so consumers
 * can keep using Base's `open` / `onOpenChange` / `render` props.
 */
export function AlertDialog(
  props: React.ComponentProps<typeof Base.Root>,
): ReactNode {
  return <Base.Root {...props} />;
}

export const AlertDialogTrigger = Base.Trigger;
export const AlertDialogClose = Base.Close;

interface ContentProps extends React.ComponentProps<typeof Base.Popup> {
  children?: ReactNode;
}

export function AlertDialogContent({
  className,
  children,
  ...rest
}: ContentProps) {
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

export function AlertDialogTitle(
  props: React.ComponentProps<typeof Base.Title>,
) {
  const { className, ...rest } = props;
  return (
    <Base.Title
      className={[styles.title, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function AlertDialogDescription(
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

/** Right-aligned action row — typically Cancel + Confirm. */
export function AlertDialogActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

import { IconXmark } from "@pond/icons";
import { Dialog } from "@pond/ui";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface StageProps extends React.ComponentPropsWithoutRef<"div"> {
  backdrop?: "scrim" | "none";
}

/** Holds the fixed-position popup chrome inside the page, over a dimmed library. */
function Stage({ className, backdrop = "scrim", ...props }: StageProps) {
  return (
    <div
      className={cn(styles.stage, className)}
      data-backdrop={backdrop}
      {...props}
    />
  );
}

interface PopupProps extends React.ComponentPropsWithoutRef<"div"> {
  width: number;
}

function Popup({ className, width, style, ...props }: PopupProps) {
  return (
    <Dialog.Preview
      className={cn(styles.popup, className)}
      style={{ ...style, ["--width" as string]: `${width}px` }}
      {...props}
    />
  );
}

function Close(props: React.ComponentPropsWithoutRef<"button">) {
  return (
    <Dialog.Action position="end" aria-label="Close" {...props}>
      <IconXmark size={12} />
    </Dialog.Action>
  );
}

export const Frame = { Stage, Popup, Close };

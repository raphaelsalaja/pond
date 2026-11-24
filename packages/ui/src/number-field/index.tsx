import { NumberField as Base } from "@base-ui/react/number-field";
import { IconArrowsExpandX } from "@pond/icons";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

function Root({ className, ...props }: Base.Root.Props) {
  return <Base.Root className={cn(styles.root, className)} {...props} />;
}

function Input({ className, ...props }: Base.Input.Props) {
  return <Base.Input className={cn(styles.input, className)} {...props} />;
}

/** A label or unit inside the field that changes the value when dragged sideways. Place it before `Input` to lead, after to trail. */
function ScrubArea({
  className,
  children,
  pixelSensitivity = 4,
  ...props
}: Base.ScrubArea.Props) {
  return (
    <Base.ScrubArea
      className={cn(styles.scrub, className)}
      pixelSensitivity={pixelSensitivity}
      {...props}
    >
      {children}
      <Base.ScrubAreaCursor className={styles.cursor}>
        <IconArrowsExpandX size={16} />
      </Base.ScrubAreaCursor>
    </Base.ScrubArea>
  );
}

export const NumberField = { Root, Input, ScrubArea };

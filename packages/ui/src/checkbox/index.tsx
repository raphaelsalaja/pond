import { Checkbox as Base } from "@base-ui/react/checkbox";
import { IconCheck as Check, IconMinus as Minus } from "@pond/icons";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

type RootProps = Base.Root.Props & {
  size?: "sm" | "md";
  /** `media` is a round check with a scrim and ring, so it reads on top of any image. */
  variant?: "default" | "media";
};

function Root({
  className,
  size = "md",
  variant = "default",
  ...props
}: RootProps) {
  return (
    <Base.Root
      data-size={size}
      data-variant={variant}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}

function Indicator({ className, ...props }: Base.Indicator.Props) {
  return (
    <Base.Indicator className={cn(styles.indicator, className)} {...props}>
      <Check size={12} data-mark="checked" />
      <Minus size={12} data-mark="indeterminate" />
    </Base.Indicator>
  );
}

interface MarkProps extends React.ComponentPropsWithoutRef<"span"> {
  checked?: boolean;
  indeterminate?: boolean;
  size?: "sm" | "md";
}

/** The box without a control, for rows like `menuitemcheckbox` that are the checkbox themselves. */
function Mark({
  checked = false,
  indeterminate = false,
  size = "md",
  className,
  ...props
}: MarkProps) {
  return (
    <span
      aria-hidden
      data-size={size}
      data-checked={(checked && !indeterminate) || undefined}
      data-indeterminate={indeterminate || undefined}
      className={cn(styles.root, className)}
      {...props}
    >
      <span
        className={styles.indicator}
        data-indeterminate={indeterminate || undefined}
      >
        <Check size={12} data-mark="checked" />
        <Minus size={12} data-mark="indeterminate" />
      </span>
    </span>
  );
}

export const Checkbox = {
  Root,
  Indicator,
  Mark,
};

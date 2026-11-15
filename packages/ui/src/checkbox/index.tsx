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

export const Checkbox = {
  Root,
  Indicator,
};

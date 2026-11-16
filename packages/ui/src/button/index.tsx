import { Button as Base } from "@base-ui/react/button";
import { clsx as cn } from "clsx";
import { Loader } from "../loader";
import { pop } from "../shared/pop";
import styles from "./styles.module.css";

export interface ButtonProps extends Base.Props {
  variant?:
    | "primary"
    | "secondary"
    | "tertiary"
    | "ghost"
    | "text"
    | "accent"
    | "destructive"
    | "link"
    | "bare";
  size?: "xs" | "sm" | "md";
  /** `compact` keeps the type and icon of `size` one height step shorter with half the inline padding, for dense trails. */
  density?: "default" | "compact";
  rounding?: "full" | "rounded";
  icon?: boolean;
  width?: "full" | "auto";
  loading?: boolean;
}

type AccessibleName = { "aria-label": string } | { "aria-labelledby": string };

type OptionalName = Pick<
  React.AriaAttributes,
  "aria-label" | "aria-labelledby"
>;

/** A literal `icon` must carry a name; a forwarded `boolean` leaves that to the wrapper's own props. */
export type IconName<Icon extends boolean | undefined> = boolean extends Icon
  ? OptionalName
  : true extends Icon
    ? AccessibleName
    : OptionalName;

export function Button<Icon extends boolean | undefined = undefined>(
  props: Omit<ButtonProps, "icon"> & { icon?: Icon } & IconName<Icon>,
): React.JSX.Element;
export function Button({
  className,
  variant = "primary",
  size = "md",
  density = "default",
  rounding = "full",
  width = "auto",
  icon,
  loading,
  disabled,
  onClick,
  children,
  ...props
}: ButtonProps) {
  return (
    <Base
      {...props}
      onClick={(event) => {
        if (icon) pop(event.currentTarget.querySelector(":scope > svg"));
        onClick?.(event);
      }}
      data-width={width}
      data-variant={variant}
      data-size={size}
      data-density={density === "compact" ? density : undefined}
      data-rounding={rounding}
      data-icon={icon ? "" : undefined}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading || undefined}
      className={cn(styles.root, className)}
    >
      {loading ? <Loader.Spinner className={styles.spinner} /> : null}
      {children}
    </Base>
  );
}

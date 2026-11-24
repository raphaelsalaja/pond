import { IconChevronDown } from "@pond/icons";
import { clsx as cn } from "clsx";
import { createContext, use, useMemo } from "react";
import { Button, type ButtonProps } from "../button";
import styles from "./styles.module.css";

type Variant = "primary" | "secondary" | "ghost";
type Size = NonNullable<ButtonProps["size"]>;

const SplitContext = createContext<{ variant: Variant; size: Size }>({
  variant: "primary",
  size: "md",
});

interface RootProps extends React.ComponentPropsWithoutRef<"fieldset"> {
  variant?: Variant;
  size?: Size;
}

function Root({
  variant = "primary",
  size = "md",
  className,
  ...props
}: RootProps) {
  const value = useMemo(() => ({ variant, size }), [variant, size]);
  return (
    <SplitContext value={value}>
      <fieldset
        data-variant={variant}
        className={cn(styles.root, className)}
        {...props}
      />
    </SplitContext>
  );
}

type SegmentProps = Omit<ButtonProps, "variant" | "size" | "icon" | "width">;

function Action({ className, ...props }: SegmentProps) {
  const { variant, size } = use(SplitContext);
  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      className={cn(styles.action, className)}
    />
  );
}

/** Opens the alternatives. Pass it to a Menu trigger through `render`; it shows a chevron unless given an icon. */
function Trigger({
  className,
  children,
  ...props
}: SegmentProps & { "aria-label": string }) {
  const { variant, size } = use(SplitContext);
  return (
    <Button
      {...props}
      icon
      variant={variant}
      size={size}
      className={cn(styles.trigger, className)}
    >
      {children ?? <IconChevronDown />}
    </Button>
  );
}

export const SplitButton = { Root, Action, Trigger };

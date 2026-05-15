import { NumberField as Base } from "@base-ui/react/number-field";
import { IconMinusOutline12, IconPlusOutline12 } from "@pond/icons/outline/12";
import { Calligraph } from "calligraph";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

function Root({ className, children, ...props }: Base.Root.Props) {
  return (
    <Base.Root className={cn(styles.root, className)} {...props}>
      <Base.Group className={styles.group}>{children}</Base.Group>
    </Base.Root>
  );
}

function Input({ className, ...props }: Base.Input.Props) {
  return (
    <Base.Input
      className={cn(styles.input, className)}
      {...props}
      render={(inputProps, state) => (
        <span
          className={styles["input-wrap"]}
          data-focused={state.focused ? "" : undefined}
        >
          <input {...inputProps} />
          <Calligraph
            variant="number"
            aria-hidden
            className={styles["input-display"]}
          >
            {state.inputValue}
          </Calligraph>
        </span>
      )}
    />
  );
}

function Increment({
  className,
  children = <IconPlusOutline12 />,
  ...props
}: Base.Increment.Props) {
  return (
    <Base.Increment
      aria-label="Increment"
      className={cn(styles.button, className)}
      {...props}
    >
      {children}
    </Base.Increment>
  );
}

function Decrement({
  className,
  children = <IconMinusOutline12 />,
  ...props
}: Base.Decrement.Props) {
  return (
    <Base.Decrement
      aria-label="Decrement"
      className={cn(styles.button, className)}
      {...props}
    >
      {children}
    </Base.Decrement>
  );
}

export const NumberField = {
  Root,
  Input,
  Increment,
  Decrement,
};

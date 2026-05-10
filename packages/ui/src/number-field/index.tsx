import { NumberField as Base } from "@base-ui/react/number-field";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ className, children, ...props }: RootProps) {
  return (
    <Base.Root
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    >
      <Base.Group className={styles.group}>{children}</Base.Group>
    </Base.Root>
  );
}

interface InputProps extends React.ComponentProps<typeof Base.Input> {}

function Input({ className, ...props }: InputProps) {
  return (
    <Base.Input
      className={[styles.input, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface IncrementProps extends React.ComponentProps<typeof Base.Increment> {}

function Increment({ className, children = "+", ...props }: IncrementProps) {
  return (
    <Base.Increment
      aria-label="Increment"
      className={[styles.button, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Base.Increment>
  );
}

interface DecrementProps extends React.ComponentProps<typeof Base.Decrement> {}

function Decrement({ className, children = "−", ...props }: DecrementProps) {
  return (
    <Base.Decrement
      aria-label="Decrement"
      className={[styles.button, className ?? ""].filter(Boolean).join(" ")}
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

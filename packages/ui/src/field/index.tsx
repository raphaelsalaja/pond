import { Field as Base } from "@base-ui/react/field";
import { forwardRef } from "react";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base.Root> {}

function Root({ className, ...props }: RootProps) {
  return (
    <Base.Root
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface LabelProps extends React.ComponentProps<typeof Base.Label> {}

const Label = forwardRef<HTMLLabelElement, LabelProps>(function FieldLabel(
  { className, ...props },
  ref,
) {
  return (
    <Base.Label
      ref={ref}
      className={[styles.label, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
});

interface ControlProps extends React.ComponentProps<typeof Base.Control> {}

function Control({ className, ...props }: ControlProps) {
  return (
    <Base.Control
      className={[styles.control, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface DescriptionProps
  extends React.ComponentProps<typeof Base.Description> {}

function Description({ className, ...props }: DescriptionProps) {
  return (
    <Base.Description
      className={[styles.description, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}

interface ErrorProps extends React.ComponentProps<typeof Base.Error> {}

function Error_({ className, ...props }: ErrorProps) {
  return (
    <Base.Error
      className={[styles.error, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

export const Field = {
  Root,
  Label,
  Control,
  Description,
  Error: Error_,
};

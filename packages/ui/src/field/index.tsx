import { Field as Base } from "@base-ui/react/field";
import { cn } from "../lib/cn";
import controlStyles from "../lib/control.module.css";
import styles from "./styles.module.css";

function Root({ className, ...props }: Base.Root.Props) {
  return <Base.Root className={cn(styles.root, className)} {...props} />;
}

function Label({ className, ...props }: Base.Label.Props) {
  return <Base.Label className={cn(styles.label, className)} {...props} />;
}

function Control({ className, ...props }: Base.Control.Props) {
  return (
    <Base.Control className={cn(controlStyles.control, className)} {...props} />
  );
}

function Description({ className, ...props }: Base.Description.Props) {
  return (
    <Base.Description
      className={cn(styles.description, className)}
      {...props}
    />
  );
}

function Error_({ className, ...props }: Base.Error.Props) {
  return <Base.Error className={cn(styles.error, className)} {...props} />;
}

export const Field = {
  Root,
  Label,
  Control,
  Description,
  Error: Error_,
};

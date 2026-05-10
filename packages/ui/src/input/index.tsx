import { Input as BaseInput } from "@base-ui/react/input";
import { forwardRef } from "react";
import styles from "./styles.module.css";

type InputVariant = "default" | "code";
type InputSize = "sm" | "md" | "lg";

interface RootProps
  extends Omit<React.ComponentPropsWithoutRef<"input">, "size"> {
  "data-variant"?: InputVariant;
  "data-size"?: InputSize;
}

const Root = forwardRef<HTMLInputElement, RootProps>(function InputRoot(
  { className, ...props },
  ref,
) {
  return (
    <BaseInput
      ref={ref}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
});

export const Input = {
  Root,
};

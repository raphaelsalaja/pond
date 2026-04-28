import { Input as BaseInput } from "@base-ui-components/react/input";
import { forwardRef } from "react";
import styles from "./input.module.css";

export type InputVariant = "default" | "code";
export type InputSize = "sm" | "md" | "lg";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  variant?: InputVariant;
  size?: InputSize;
}

/**
 * Pond `<Input>`. Wraps Base UI's `<Input>` (which is a thin
 * accessibility-aware shell over native `<input>`) and adds:
 *
 *   - sizing tokens (sm/md/lg)
 *   - a `code` variant rendered in a monospace face — used for ingest
 *     tokens, pairing URLs, and other "select-and-copy" payloads.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant = "default", size = "md", className, ...rest },
  ref,
) {
  return (
    <BaseInput
      ref={ref}
      className={[
        styles.input,
        styles[`variant-${variant}`],
        styles[`size-${size}`],
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
});

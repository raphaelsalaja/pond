import { forwardRef } from "react";
import styles from "./button.module.css";

export type ButtonVariant = "default" | "ghost" | "primary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders the button as a square icon-only target (28×28 / etc). */
  iconOnly?: boolean;
}

/**
 * Pond `<Button>`. Wraps a native `<button>` (Base UI's Button is
 * functionally identical for our needs and would force every consumer
 * to add a `render` prop just to support `<Link>`s — we do that with
 * a Ghost-styled `<a>` directly when needed).
 *
 * Variants:
 *   - `default`  light surface, hairline border
 *   - `ghost`    transparent, hover background only
 *   - `primary`  inverse fg/bg (used for the welcome CTA, etc)
 *   - `danger`   destructive red text + matching hover
 *
 * Sizes default to `md` (28px), matching the rest of the chrome.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "default",
      size = "md",
      iconOnly = false,
      className,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={[
          styles.button,
          styles[`variant-${variant}`],
          styles[`size-${size}`],
          iconOnly ? styles.iconOnly : "",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
    );
  },
);

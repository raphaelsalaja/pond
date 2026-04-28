import { Field as BaseField } from "@base-ui-components/react/field";
import { forwardRef, type ReactNode } from "react";
import styles from "./field.module.css";

interface FieldProps extends React.ComponentProps<typeof BaseField.Root> {
  children?: ReactNode;
}

/**
 * Form field root. Pairs a `<FieldLabel>` (rendered first) with a
 * `<FieldControl>` (the input/switch/select) and optional
 * `<FieldDescription>` / `<FieldError>` siblings.
 *
 *   <Field name="aiKey">
 *     <FieldLabel>AI Gateway key</FieldLabel>
 *     <FieldControl>
 *       <Input type="password" value={…} />
 *     </FieldControl>
 *     <FieldDescription>Used to enrich saves with…</FieldDescription>
 *   </Field>
 *
 * Base UI handles the `aria-describedby` / `aria-labelledby` plumbing.
 */
export function Field({ className, children, ...rest }: FieldProps) {
  return (
    <BaseField.Root
      className={[styles.field, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </BaseField.Root>
  );
}

export const FieldLabel = forwardRef<
  HTMLLabelElement,
  React.ComponentProps<typeof BaseField.Label>
>(function FieldLabel({ className, ...rest }, ref) {
  return (
    <BaseField.Label
      ref={ref}
      className={[styles.label, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

/**
 * Control slot. Use this to wrap the actual input element so Base UI
 * can wire up `aria-describedby`. For non-`<Input>` controls (Switch,
 * Select), wrap with `render={…}` per Base UI conventions.
 */
export function FieldControl(
  props: React.ComponentProps<typeof BaseField.Control>,
) {
  const { className, ...rest } = props;
  return (
    <BaseField.Control
      className={[styles.control, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

export function FieldDescription(
  props: React.ComponentProps<typeof BaseField.Description>,
) {
  const { className, ...rest } = props;
  return (
    <BaseField.Description
      className={[styles.description, className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

export function FieldError(
  props: React.ComponentProps<typeof BaseField.Error>,
) {
  const { className, ...rest } = props;
  return (
    <BaseField.Error
      className={[styles.error, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

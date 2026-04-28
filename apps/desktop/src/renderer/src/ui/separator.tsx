import { Separator as Base } from "@base-ui-components/react/separator";
import styles from "./separator.module.css";

/** Hairline horizontal/vertical divider. */
export function Separator({
  className,
  ...rest
}: React.ComponentProps<typeof Base>) {
  return (
    <Base
      className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

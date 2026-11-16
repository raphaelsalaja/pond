import { cn } from "@pond/ui";
import { Code } from "../code";
import styles from "./styles.module.css";

const SHADOWS = [
  {
    token: "--ds-shadow-border",
    use: "Surfaces in the page: cards, fields, panes.",
  },
  {
    token: "--ds-shadow-raised",
    use: "Raised controls: switch thumbs and selected segments.",
  },
  {
    token: "--ds-shadow-overlay",
    use: "Layers above the page: menus, popovers, tooltips.",
  },
  { token: "--ds-shadow-dialog", use: "Dialogs and the command menu." },
] as const;

interface ShadowsProps extends React.ComponentPropsWithoutRef<"ul"> {}

export function Shadows({ className, ...props }: ShadowsProps) {
  return (
    <ul className={cn(styles.grid, className)} {...props}>
      {SHADOWS.map(({ token, use }) => (
        <li key={token} className={styles.item}>
          <span
            className={styles.surface}
            style={{ boxShadow: `var(${token})` }}
          />
          <Code.Inline>{token}</Code.Inline>
          <span className={styles.use}>{use}</span>
        </li>
      ))}
    </ul>
  );
}

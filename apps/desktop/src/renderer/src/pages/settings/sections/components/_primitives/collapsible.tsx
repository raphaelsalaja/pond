import { Collapsible } from "@pond/ui";
import styles from "../styles.module.css";
import { Cell } from "./cell";

export default function CollapsibleCell() {
  return (
    <Cell label="Collapsible">
      <Collapsible.Root defaultOpen={false} className={styles.collapsible}>
        <Collapsible.Trigger>Show details</Collapsible.Trigger>
        <Collapsible.Panel>
          <div className={styles["collapsible-body"]}>
            Anything tucked behind a disclosure triangle.
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </Cell>
  );
}

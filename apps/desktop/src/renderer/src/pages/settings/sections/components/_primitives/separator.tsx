import { Separator } from "@pond/ui";
import styles from "../styles.module.css";
import { Cell } from "./cell";

export default function SeparatorCell() {
  return (
    <Cell label="Separator">
      <div className={styles["separator-demo"]}>
        <span>Above</span>
        <Separator.Root orientation="horizontal" />
        <span>Below</span>
      </div>
    </Cell>
  );
}

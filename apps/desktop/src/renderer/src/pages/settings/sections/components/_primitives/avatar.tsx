import { Avatar } from "@pond/ui";
import styles from "../styles.module.css";
import { Cell } from "./cell";

export default function AvatarCell() {
  return (
    <Cell label="Avatar">
      <div className={styles.row}>
        <Avatar.Root>
          <Avatar.Fallback>RS</Avatar.Fallback>
        </Avatar.Root>
        <Avatar.Root>
          <Avatar.Fallback>JM</Avatar.Fallback>
        </Avatar.Root>
        <Avatar.Root>
          <Avatar.Fallback>AK</Avatar.Fallback>
        </Avatar.Root>
      </div>
    </Cell>
  );
}

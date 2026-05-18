import { useCardContext } from "./context";
import styles from "./styles.module.css";

export function Placeholder() {
  const { state } = useCardContext();
  if (state.unit && !state.isBroken) return null;
  return <div className={styles.placeholder} aria-hidden />;
}

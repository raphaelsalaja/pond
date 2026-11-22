import { Button } from "@pond/ui";
import styles from "./styles.module.css";

export function Suggestions({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (suggestion: string) => void;
}) {
  return (
    <div
      className={styles.suggestions}
      role="group"
      aria-label="Suggested Replies"
    >
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion}
          size="sm"
          variant="tertiary"
          onClick={() => onPick(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}

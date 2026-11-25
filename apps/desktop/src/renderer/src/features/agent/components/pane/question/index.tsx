import { Badge, Button } from "@pond/ui";
import { useId, useState } from "react";
import { cardKeys } from "../card-keys";
import { QuestionCard } from "../question-card";
import styles from "./styles.module.css";

export function KoiQuestion({
  question,
  options,
  recommended,
  answered,
  disabled = false,
  onAnswer,
}: {
  question: string;
  options: ReadonlyArray<string>;
  recommended?: number;
  answered?: string;
  disabled?: boolean;
  onAnswer: (answer: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const answer = choice;
  const locked = busy || disabled;
  const folded = Boolean(answered) || later;

  async function submit(value = answer) {
    if (!value || locked) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAnswer(value);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Couldn't send your answer. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const onKeyDown = cardKeys({
    submit: () => void submit(),
    cancel: answered || disabled ? undefined : () => setLater(true),
    pick: (index) => {
      if (locked || answered || later) {
        return false;
      }
      const option = options[index];
      if (option === undefined) {
        return false;
      }
      setChoice(option);
      void submit(option);
      return true;
    },
  });

  return (
    <div className={styles.question} aria-busy={busy}>
      {answered ? (
        <QuestionCard.Summary
          aria-label={question}
          label={answered}
          detail={question}
          open={open}
          onOpenChange={setOpen}
        >
          <p className={styles.asked}>{question}</p>
          <p className={styles.answer}>{answered}</p>
        </QuestionCard.Summary>
      ) : later ? (
        <QuestionCard.Summary
          aria-label={question}
          label="Question waiting"
          detail={question}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setLater(false)}
            >
              Answer
            </Button>
          }
        />
      ) : null}
      {/* Enters on its own; a height reveal would clip the card's shadow. */}
      {folded ? null : (
        <QuestionCard.Root aria-labelledby={titleId} onKeyDown={onKeyDown}>
          <QuestionCard.Header title={question} titleId={titleId} />
          <QuestionCard.Options aria-labelledby={titleId}>
            {options.map((option, index) => (
              <QuestionCard.Option
                key={option}
                selected={choice === option}
                shortcut={index + 1}
                disabled={locked}
                aside={
                  index === recommended ? (
                    <Badge.Root>Recommended</Badge.Root>
                  ) : null
                }
                onClick={() => setChoice(option)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.metaKey &&
                    !event.ctrlKey
                  ) {
                    event.preventDefault();
                    setChoice(option);
                    void submit(option);
                  }
                }}
              >
                {option}
              </QuestionCard.Option>
            ))}
          </QuestionCard.Options>
          {error ? <QuestionCard.Alert>{error}</QuestionCard.Alert> : null}
          <QuestionCard.Footer>
            <Button
              size="sm"
              variant="secondary"
              disabled={locked}
              onClick={() => setLater(true)}
            >
              Later
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!answer || locked}
              loading={busy}
              onClick={() => void submit()}
            >
              Continue
            </Button>
          </QuestionCard.Footer>
        </QuestionCard.Root>
      )}
    </div>
  );
}

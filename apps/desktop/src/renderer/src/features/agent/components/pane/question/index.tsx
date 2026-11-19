import { Button, Reveal } from "@pond/ui";
import { Prompt } from "@pond/ui/prompt";
import { useState } from "react";
import styles from "./styles.module.css";

const FREEFORM = Symbol("freeform");

function letter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function KoiQuestion({
  question,
  options,
  answered,
  disabled = false,
  onAnswer,
}: {
  question: string;
  options: readonly string[];
  answered?: string;
  disabled?: boolean;
  onAnswer: (answer: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string | typeof FREEFORM | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = choice === FREEFORM ? text.trim() : choice;
  const locked = busy || disabled;

  async function submit(value = answer) {
    if (!value || locked) return;
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

  return (
    <Prompt.Root aria-label={question} aria-busy={busy}>
      <Reveal visible={Boolean(answered)} initial={false}>
        <Prompt.Answers>
          <Prompt.Answer>
            <Prompt.AnswerQuestion>{question}</Prompt.AnswerQuestion>
            <Prompt.AnswerText>{answered}</Prompt.AnswerText>
          </Prompt.Answer>
        </Prompt.Answers>
      </Reveal>
      <Reveal visible={!answered} initial={false}>
        <Prompt.Body>
          <Prompt.Title>{question}</Prompt.Title>
          <Prompt.Choices>
            {options.map((option, index) => (
              <Prompt.Choice
                key={option}
                letter={letter(index)}
                selected={choice === option}
                disabled={locked}
                onClick={() => setChoice(option)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setChoice(option);
                    void submit(option);
                  }
                }}
              >
                {option}
              </Prompt.Choice>
            ))}
            {disabled ? null : (
              <Prompt.Freeform
                letter={letter(options.length)}
                selected={choice === FREEFORM}
                disabled={busy}
                aria-label="Your answer"
                placeholder="Other"
                value={text}
                onFocus={() => setChoice(FREEFORM)}
                onChange={(event) => {
                  setText(event.target.value);
                  setChoice(FREEFORM);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void submit();
                  }
                }}
              />
            )}
          </Prompt.Choices>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </Prompt.Body>
        <Prompt.Footer>
          <Button
            size="sm"
            variant={answer ? "primary" : "tertiary"}
            disabled={!answer || locked}
            loading={busy}
            onClick={() => void submit()}
          >
            Continue
          </Button>
        </Prompt.Footer>
      </Reveal>
    </Prompt.Root>
  );
}

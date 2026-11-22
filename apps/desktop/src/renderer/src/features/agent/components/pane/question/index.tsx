import { IconCircleCheck, IconCircleQuestion } from "@pond/icons";
import { Badge, Button, Reveal } from "@pond/ui";
import { Prompt } from "@pond/ui/prompt";
import { useState } from "react";
import { cardKeys } from "../card-keys";
import styles from "./styles.module.css";

const FREEFORM = Symbol("freeform");

export function KoiQuestion({
  question,
  options,
  recommended,
  answered,
  disabled = false,
  onAnswer,
}: {
  question: string;
  options: readonly string[];
  recommended?: number;
  answered?: string;
  disabled?: boolean;
  onAnswer: (answer: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<string | typeof FREEFORM | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [open, setOpen] = useState(false);
  const answer = choice === FREEFORM ? text.trim() : choice;
  const locked = busy || disabled;
  const folded = Boolean(answered) || later;

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

  const onKeyDown = cardKeys({
    submit: () => void submit(),
    cancel: answered || disabled ? undefined : () => setLater(true),
    pick: (index, card) => {
      if (locked || answered || later) return false;
      const option = options[index];
      if (option !== undefined) {
        setChoice(option);
        void submit(option);
        return true;
      }
      if (index !== options.length) return false;
      card.querySelector("input")?.focus();
      return true;
    },
  });

  return (
    <Prompt.Root aria-label={question} aria-busy={busy} onKeyDown={onKeyDown}>
      <Reveal visible={folded} initial={false}>
        {answered ? (
          <>
            <Prompt.Receipt
              icon={<IconCircleCheck size={16} />}
              label={answered}
              detail={question}
              open={open}
              onOpenChange={setOpen}
            />
            <Reveal visible={open} initial={false}>
              <Prompt.Answers>
                <Prompt.Answer>
                  <Prompt.AnswerQuestion>{question}</Prompt.AnswerQuestion>
                  <Prompt.AnswerText>{answered}</Prompt.AnswerText>
                </Prompt.Answer>
              </Prompt.Answers>
            </Reveal>
          </>
        ) : (
          <Prompt.Receipt
            icon={<IconCircleQuestion size={16} />}
            label="Question waiting"
            detail={question}
            action={
              <Button
                size="xs"
                variant="secondary"
                onClick={() => setLater(false)}
              >
                Answer
              </Button>
            }
          />
        )}
      </Reveal>
      <Reveal visible={!folded} initial={false}>
        <Prompt.Body>
          <Prompt.Title>{question}</Prompt.Title>
          <Prompt.Choices>
            {options.map((option, index) => (
              <Prompt.Choice
                key={option}
                marker={index + 1}
                selected={choice === option}
                disabled={locked}
                hint={
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
              </Prompt.Choice>
            ))}
            {disabled ? null : (
              <Prompt.Freeform
                marker={options.length + 1}
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
            variant="secondary"
            disabled={locked}
            onClick={() => setLater(true)}
          >
            Later
          </Button>
          <Button
            size="sm"
            variant="accent"
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

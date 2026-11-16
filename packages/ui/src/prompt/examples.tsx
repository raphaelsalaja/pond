import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Prompt } from ".";

function Frame({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="always">
      <div style={{ width: 320 }}>{children}</div>
    </MotionConfig>
  );
}

export const docs: ComponentDocs = {
  slug: "prompt",
  name: "Prompt",
  tier: "composite",
  summary:
    "A card in the Fish column that asks a question, offers lettered choices and shows the answer once given.",
  parts: [
    {
      name: "Prompt.Root",
      description:
        "The card. `tone` is default or destructive. `visible` reveals or collapses it.",
    },
    { name: "Prompt.Body", description: "The question area." },
    {
      name: "Prompt.Title",
      description:
        "The question. Names `Prompt.Choices` unless you pass a label.",
    },
    {
      name: "Prompt.Description",
      description: "Supporting text under the title.",
    },
    {
      name: "Prompt.Choices",
      description: "A fieldset that groups the choices under the question.",
    },
    {
      name: "Prompt.Choice",
      description: "A lettered choice button. `selected` sets `aria-pressed`.",
    },
    {
      name: "Prompt.Freeform",
      description:
        "A lettered text field for an answer not in the list. Named Your Answer by default.",
    },
    { name: "Prompt.Footer", description: "The row of actions." },
    {
      name: "Prompt.Answers",
      description: "The settled state that lists each question and its answer.",
    },
    {
      name: "Prompt.Answer",
      description: "One question and answer pair. `tone` is default or muted.",
    },
    {
      name: "Prompt.AnswerQuestion",
      description: "The question that was asked.",
    },
    {
      name: "Prompt.AnswerText",
      description: "The answer, clamped to three lines.",
    },
  ],
  keyboard: [
    {
      keys: "Tab",
      action: "Moves between choices, the text field and the actions",
    },
    { keys: "Enter / Space", action: "Selects the focused choice" },
  ],
  accessibility: [
    "`Prompt.Choices` is a fieldset labelled by `Prompt.Title` through `aria-labelledby`.",
    "Each choice is a native button with `aria-pressed`. The letter badge is hidden from screen readers.",
    "`Prompt.Freeform` defaults to the name Your Answer. Pass `aria-label` to change it.",
    "Submitting with Enter from a choice or the text field is up to the caller.",
    "The reveal skips its animation under reduced motion.",
  ],
  examples: [
    {
      name: "Question",
      render: () => (
        <Frame>
          <Prompt.Root>
            <Prompt.Body>
              <Prompt.Title>Which folder should these go in?</Prompt.Title>
              <Prompt.Choices>
                <Prompt.Choice letter="A" selected>
                  Cabin
                </Prompt.Choice>
                <Prompt.Choice letter="B">Furniture</Prompt.Choice>
                <Prompt.Freeform letter="C" placeholder="Other" />
              </Prompt.Choices>
            </Prompt.Body>
            <Prompt.Footer>
              <Button size="sm">Continue</Button>
            </Prompt.Footer>
          </Prompt.Root>
        </Frame>
      ),
    },
    {
      name: "Destructive",
      render: () => (
        <Frame>
          <Prompt.Root tone="destructive">
            <Prompt.Body>
              <Prompt.Title>Empty Trash?</Prompt.Title>
              <Prompt.Description>
                Every save in Trash is deleted for good. You can't undo this.
              </Prompt.Description>
            </Prompt.Body>
            <Prompt.Footer>
              <Button size="sm" variant="ghost">
                Keep Trash
              </Button>
              <Button size="sm" variant="destructive">
                Empty Trash
              </Button>
            </Prompt.Footer>
          </Prompt.Root>
        </Frame>
      ),
    },
    {
      name: "Answered",
      render: () => (
        <Frame>
          <Prompt.Root>
            <Prompt.Answers>
              <Prompt.Answer>
                <Prompt.AnswerQuestion>
                  Which folder should these go in?
                </Prompt.AnswerQuestion>
                <Prompt.AnswerText>Cabin</Prompt.AnswerText>
              </Prompt.Answer>
              <Prompt.Answer tone="muted">
                <Prompt.AnswerQuestion>Tag them too?</Prompt.AnswerQuestion>
                <Prompt.AnswerText>Skipped</Prompt.AnswerText>
              </Prompt.Answer>
            </Prompt.Answers>
          </Prompt.Root>
        </Frame>
      ),
    },
  ],
};

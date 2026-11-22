import { MotionConfig } from "motion/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Prompt } from ".";

const OTHER = "other";

function Question({ onSubmit }: { onSubmit?: (answer: string) => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState("");
  return (
    <MotionConfig reducedMotion="always">
      <Prompt.Root>
        <Prompt.Body>
          <Prompt.Title>Which folder should these go in?</Prompt.Title>
          <Prompt.Choices>
            {["Cabin", "Furniture"].map((option, index) => (
              <Prompt.Choice
                key={option}
                marker={index + 1}
                selected={choice === option}
                onClick={() => setChoice(option)}
              >
                {option}
              </Prompt.Choice>
            ))}
            <Prompt.Freeform
              marker="3"
              placeholder="Other"
              selected={choice === OTHER}
              value={text}
              onFocus={() => setChoice(OTHER)}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSubmit?.(text);
              }}
            />
          </Prompt.Choices>
        </Prompt.Body>
      </Prompt.Root>
    </MotionConfig>
  );
}

describe("Prompt keyboard", () => {
  it("names the choices group after the question", async () => {
    const screen = await render(<Question />);
    await expect
      .element(
        screen.getByRole("group", { name: "Which folder should these go in?" }),
      )
      .toBeInTheDocument();
  });

  it("reaches and selects each choice with the keyboard", async () => {
    const screen = await render(<Question />);
    const cabin = screen.getByRole("button", { name: "Cabin" });
    const furniture = screen.getByRole("button", { name: "Furniture" });

    await userEvent.tab();
    await expect.element(cabin).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect.element(cabin).toHaveAttribute("aria-pressed", "true");

    await userEvent.tab();
    await expect.element(furniture).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(furniture).toHaveAttribute("aria-pressed", "true");
    await expect.element(cabin).toHaveAttribute("aria-pressed", "false");
  });

  it("gives the freeform field a default name and passes Enter to the caller", async () => {
    const answers: string[] = [];
    const screen = await render(
      <Question onSubmit={(answer) => answers.push(answer)} />,
    );
    const field = screen.getByRole("textbox", { name: "Your Answer" });

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await expect.element(field).toHaveFocus();

    await userEvent.keyboard("Kitchen{Enter}");
    expect(answers).toEqual(["Kitchen"]);
  });

  it("lets the caller rename the freeform field", async () => {
    const screen = await render(
      <Prompt.Root>
        <Prompt.Choices aria-label="Folder">
          <Prompt.Freeform marker="1" aria-label="Folder Name" />
        </Prompt.Choices>
      </Prompt.Root>,
    );
    await expect
      .element(screen.getByRole("textbox", { name: "Folder Name" }))
      .toBeInTheDocument();
    await expect
      .element(screen.getByRole("group", { name: "Folder" }))
      .toBeInTheDocument();
  });
});

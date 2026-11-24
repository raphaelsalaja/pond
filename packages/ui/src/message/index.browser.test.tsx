import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { Message } from ".";

const ANSWER = "Three saves fit the cabin.";

describe("Message actions keyboard", () => {
  it("reaches Copy and Quote with Tab and runs them with Enter", async () => {
    const copied: Array<string> = [];
    let quoted = 0;
    const screen = await render(
      <Message.View
        from="assistant"
        actions={
          <Message.ActionBar
            text={ANSWER}
            onCopy={async (text) => {
              copied.push(text);
            }}
            onQuote={() => {
              quoted += 1;
            }}
          />
        }
      >
        <Message.Bubble>{ANSWER}</Message.Bubble>
      </Message.View>,
    );
    const copy = screen.getByRole("button", { name: "Copy" });
    const quote = screen.getByRole("button", { name: "Quote" });

    await userEvent.tab();
    await expect.element(copy).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => copied).toEqual([ANSWER]);

    await userEvent.tab();
    await expect.element(quote).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect.poll(() => quoted).toBe(1);
  });

  it("skips a disabled Copy when there is no text", async () => {
    const screen = await render(
      <>
        <Message.ActionBar />
        <button type="button">After</button>
      </>,
    );
    await expect
      .element(screen.getByRole("button", { name: "Copy" }))
      .toBeDisabled();

    await userEvent.tab();
    await expect
      .element(screen.getByRole("button", { name: "After" }))
      .toHaveFocus();
  });

  it("offers Retry only when the reply can run again", async () => {
    let retried = 0;
    const screen = await render(
      <Message.ActionBar
        text={ANSWER}
        onRetry={() => {
          retried += 1;
        }}
      />,
    );
    await screen.getByRole("button", { name: "Retry" }).click();
    await expect.poll(() => retried).toBe(1);

    await screen.rerender(<Message.ActionBar text={ANSWER} />);
    await expect
      .element(screen.getByRole("button", { name: "Retry" }))
      .not.toBeInTheDocument();
  });

  it("keeps the HTML role attribute free", async () => {
    const screen = await render(
      <Message.Root from="user" role="listitem" aria-label="Your Question">
        <Message.Body>{ANSWER}</Message.Body>
      </Message.Root>,
    );
    await expect
      .element(screen.getByRole("listitem", { name: "Your Question" }))
      .toHaveAttribute("data-from", "user");
  });
});

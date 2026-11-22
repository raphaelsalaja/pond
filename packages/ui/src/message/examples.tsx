import type { ReactNode } from "react";
import type { ComponentDocs } from "../shared/docs";
import { Message } from ".";

const QUESTION = "What did I save for the cabin?";
const ANSWER =
  "Three saves fit the cabin: the Kiladalen roofline and two chairs for inside.";

function Thread({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 360 }}>
      {children}
    </div>
  );
}

export const docs: ComponentDocs = {
  slug: "message",
  name: "Message",
  tier: "composite",
  summary:
    "One turn in a Fish conversation. Your bubbles take the fish's color, and its replies sit in gray bubbles that join into one group.",
  parts: [
    {
      name: "Message.Root",
      description:
        "The turn, an `<article>`. `from` is user, assistant or system and sets the layout.",
    },
    {
      name: "Message.View",
      description:
        "Root with leading, body, footer and actions slots laid out. `animateEntrance` plays the arrival.",
    },
    { name: "Message.Body", description: "The column that holds the content." },
    {
      name: "Message.Bubble",
      description:
        "One block of text. Set `--message-accent` and `--message-accent-foreground` on an ancestor to color your bubbles.",
    },
    {
      name: "Message.Leading",
      description: "Chips above the body, like attachments.",
    },
    {
      name: "Message.Footer",
      description: "Content under the body, like sources.",
    },
    {
      name: "Message.Actions",
      description: "The row that holds the action bar.",
    },
    {
      name: "Message.ActionBar",
      description:
        "Copy and Quote buttons. Copy is disabled until there is text.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves to Copy, then Quote" },
    { keys: "Enter / Space", action: "Copies the text or quotes the turn" },
  ],
  accessibility: [
    "Each turn is an `<article>`. The sender goes in `from`, so `role` stays free for ARIA.",
    "No live region here. The Fish column announces when a reply finishes, so a region per message would read replies twice.",
    "Actions sit beside the last bubble and fade in on hover and on focus within the turn, so keyboard users see them.",
    "Copy and Quote are icon buttons named Copy and Quote, with tooltips.",
    "The entrance animation is off under reduced motion.",
  ],
  examples: [
    {
      name: "Conversation",
      render: () => (
        <Thread>
          <Message.View from="user">
            <Message.Bubble>{QUESTION}</Message.Bubble>
          </Message.View>
          <Message.View from="assistant">
            <Message.Bubble>{ANSWER}</Message.Bubble>
          </Message.View>
        </Thread>
      ),
    },
    {
      name: "With Actions",
      render: () => (
        <Thread>
          <Message.View
            from="assistant"
            actions={<Message.ActionBar text={ANSWER} />}
          >
            <Message.Bubble>{ANSWER}</Message.Bubble>
          </Message.View>
        </Thread>
      ),
    },
    {
      name: "Several Bubbles",
      render: () => (
        <Thread>
          <Message.View from="assistant">
            <Message.Bubble>{ANSWER}</Message.Bubble>
            <Message.Bubble>
              Four of them are chairs. I can tag them for the cabin.
            </Message.Bubble>
          </Message.View>
        </Thread>
      ),
    },
  ],
};

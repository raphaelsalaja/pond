import type { ComponentDocs } from "../shared/docs";
import { useTextReveal } from ".";

function Reply({ content }: { content: string }) {
  const { text, pending } = useTextReveal(content, false);
  return <p aria-busy={pending || undefined}>{text}</p>;
}

export const docs: ComponentDocs = {
  slug: "text-reveal",
  name: "Text Reveal",
  tier: "motion",
  summary:
    "A hook that types streamed text out at a steady pace instead of in jumps.",
  parts: [
    {
      name: "useTextReveal(content, animate, finish)",
      description:
        "Returns `text` to render and `pending` while it trails `content`.",
    },
    {
      name: "animate",
      description: "Starts typing. `false` shows `content` as it is.",
    },
    {
      name: "finish",
      description:
        "Jumps to the full `content`, for when a stream ends or you stop it.",
    },
  ],
  keyboard: [],
  accessibility: [
    "Renders nothing itself. Set `aria-busy` from `pending` so screen readers wait for the full text.",
    "Under reduced motion it returns the full `content` at once.",
  ],
  examples: [
    {
      name: "Settled",
      render: () => <Reply content="Koi tagged 12 saves in Design." />,
    },
  ],
};

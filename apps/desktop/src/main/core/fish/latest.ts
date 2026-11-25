import type { AssistantMetadata } from "../../../shared/assistant";
import { plainPreview } from "../../../shared/assistant-text";
import type { FishLatest } from "../../../shared/fish-contracts";

export function latestFromMessage(message: {
  role: string;
  content: string;
  metadata: AssistantMetadata | null;
  createdAt: Date;
}): FishLatest {
  const at = message.createdAt.getTime();
  const metadata = message.metadata;
  if (metadata?.routine) {
    return { from: "routine", text: "", at };
  }
  if (message.role === "user") {
    return { from: "you", text: plainPreview(message.content), at };
  }
  const text = plainPreview(message.content);
  if (text) return { from: "fish", text, at };
  const changes = metadata?.changes?.length ?? 0;
  if (changes) {
    return {
      from: "fish",
      text: `Proposed ${changes} ${changes === 1 ? "change" : "changes"}`,
      at,
    };
  }
  return { from: "fish", text: metadata?.error ?? "", at };
}

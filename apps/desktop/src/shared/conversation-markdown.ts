export function conversationMarkdown(
  title: string | null,
  messages: ReadonlyArray<{ role: string; content: string }>,
): string {
  const heading = (title || "New Chat").replaceAll(/[\r\n]+/g, " ");
  return [
    `# ${heading}`,
    ...messages.flatMap((message) =>
      message.role === "user" || message.role === "assistant"
        ? [
            `## ${message.role === "user" ? "You" : "Fish"}\n\n${message.content}`,
          ]
        : [],
    ),
    "",
  ].join("\n\n");
}

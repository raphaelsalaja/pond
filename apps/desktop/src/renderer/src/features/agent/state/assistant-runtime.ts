export function stopAssistant(chatId: string | null, requestId: string | null) {
  if (!chatId || !requestId) return;
  void window.pond.query("agent.stop", { chatId, requestId });
}

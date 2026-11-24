export type AgentStreamEvent =
  | { type: "data"; data: Array<number> }
  | { type: "end" }
  | { type: "error"; error: string };

export type McpHostLoss = "stdin-closed" | "parent-exited";

interface HostStdin {
  once(event: "end" | "close", listener: () => void): void;
  off(event: "end" | "close", listener: () => void): void;
}

export interface McpHostWatchInput {
  stdin: HostStdin;
  parentPid: () => number;
  onLost: (reason: McpHostLoss) => void;
  every: (run: () => void, ms: number) => () => void;
  pollMs?: number;
}

const PARENT_POLL_MS = 5_000;

/** The MCP SDK stdio transport ignores stdin EOF, so a host that quits would leave this process running forever. */
export function watchMcpHost({
  stdin,
  parentPid,
  onLost,
  every,
  pollMs = PARENT_POLL_MS,
}: McpHostWatchInput): () => void {
  const host = parentPid();
  let stopped = false;
  const lose = (reason: McpHostLoss) => {
    if (stopped) return;
    stop();
    onLost(reason);
  };
  const closed = () => lose("stdin-closed");
  stdin.once("end", closed);
  stdin.once("close", closed);
  /** A host that dies without closing the pipe still reparents this process. */
  const cancelPoll = every(() => {
    if (parentPid() !== host) lose("parent-exited");
  }, pollMs);
  function stop(): void {
    if (stopped) return;
    stopped = true;
    stdin.off("end", closed);
    stdin.off("close", closed);
    cancelPoll();
  }
  return stop;
}

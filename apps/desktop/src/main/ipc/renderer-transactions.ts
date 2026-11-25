import type { Transaction } from "@pond/schema/tx";

/** File moves name absolute main-process paths, so a renderer could use one to pull any file into the Library. */
export function assertRendererTransactions(
  transactions: ReadonlyArray<Transaction>,
): void {
  if (transactions.some((tx) => "fileMoves" in tx && tx.fileMoves)) {
    throw new Error("This change can't be applied from the app window.");
  }
}

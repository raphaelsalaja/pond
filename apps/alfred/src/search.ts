import { curlCommand, failureFor } from "./api";
import { errorItems, saveItems } from "./items";
import { request } from "./jxa";
import { SavesResponseSchema } from "./responses";

export function run(argv: Array<string>): string {
  const query = (argv[0] ?? "").trim();
  const result = request(
    query
      ? curlCommand("/library/search", { query, limit: 20 })
      : curlCommand("/library/query", {
          sortKey: "savedAt",
          sortDir: "desc",
          limit: 20,
          include: ["saves"],
        }),
  );
  if (!result) return JSON.stringify({ items: errorItems("offline") });
  const failure = failureFor(result);
  if (failure) return JSON.stringify({ items: errorItems(failure) });
  const parsed = SavesResponseSchema.safeParse(result.body);
  if (!parsed.success) return JSON.stringify({ items: errorItems("failed") });
  const items = saveItems(parsed.data.data.saves);
  return JSON.stringify({
    items:
      items.length > 0 ? items : [{ title: "No results found", valid: false }],
  });
}

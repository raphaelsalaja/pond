import { getAppRouter } from "@/shared/lib/app-router";

export function viewAccountItems(accountId: string | readonly string[]): void {
  const ids = Array.isArray(accountId) ? [...accountId] : [accountId];
  const id = ids[0];
  const router = getAppRouter();
  if (!id || !router) return;
  const filters = {
    combinator: "and",
    rules: [
      ids.length === 1
        ? { field: "account", operator: "eq", value: id }
        : { field: "account", operator: "in", value: ids },
    ],
  };
  router.history.push(`/${router.options.stringifySearch({ filters })}`);
}

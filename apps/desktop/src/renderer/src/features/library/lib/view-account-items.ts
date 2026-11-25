import { getAppHistory, getAppRouter } from "@/shared/lib/app-router";

export function viewAccountItems(
  accountId: string | ReadonlyArray<string>,
): void {
  const ids = [accountId].flat();
  const id = ids[0];
  const router = getAppRouter();
  const history = getAppHistory();
  if (!id || !router || !history) {
    return;
  }
  const filters = {
    combinator: "and",
    rules: [
      ids.length === 1
        ? { field: "account", operator: "eq", value: id }
        : { field: "account", operator: "in", value: ids },
    ],
  };
  history.push(`/${router.options.stringifySearch({ filters })}`);
}

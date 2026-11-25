import type { Menu } from "@pond/ui";
import { useCallback, useState } from "react";
import type { ComponentProps } from "react";

type FilterProviderProps = ComponentProps<typeof Menu.FilterProvider>;
type ChangeDetails = Parameters<
  NonNullable<FilterProviderProps["onValueChange"]>
>[1];

/** Externally filtered menus keep the query through the exit transition and clear it on the next open. */
export function useMenuFilterQuery() {
  const [query, setQuery] = useState("");
  const onValueChange = useCallback((value: string, details: ChangeDetails) => {
    if (details.reason === "popup-close") return;
    setQuery(value);
  }, []);
  const reset = useCallback(() => setQuery(""), []);
  return { query, onValueChange, reset };
}

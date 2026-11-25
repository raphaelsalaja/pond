import { createElement } from "react";
import { BrandTile, getSourceDefForIdentity } from "@/features/sources";
import type { FilterOption } from "./options";

export function sourceOptions(
  values: ReadonlyArray<string>,
): Array<FilterOption> {
  return values.map((value) => {
    const source = getSourceDefForIdentity(value);
    return {
      label:
        source?.source === "local" ? "Local Files" : (source?.label ?? value),
      predicate: { field: "source", operator: "eq", value },
      icon: source
        ? createElement(BrandTile, {
            source: source.source,
            size: 16,
            rounding: "full",
          })
        : undefined,
    };
  });
}

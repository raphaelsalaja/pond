import { useMemo } from "react";
import { useSaves } from "@/features/saves/pool";
import { computeLiveFacets } from "@/features/search/lib/live-facets";
import type { NlFacets } from "@/features/search/lib/nl-query";

export function useNlFacets(): NlFacets {
  const saves = useSaves();
  return useMemo(() => computeLiveFacets(saves), [saves]);
}

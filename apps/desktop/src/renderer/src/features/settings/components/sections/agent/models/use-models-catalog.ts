import { ASSISTANT_MODELS } from "@shared/assistant";
import { modelsForChooser } from "@shared/provider-models";
import { useQueries, useQuery } from "@tanstack/react-query";
import { keyRowsSchema } from "../types";
import type { AgentPrefs } from "../types";
import type { CatalogModel } from "./types";

function uniqueErrors(rows: Array<{ error?: string }>) {
  return [...new Set(rows.flatMap((row) => (row.error ? [row.error] : [])))];
}

function catalogLoadError(
  isError: boolean,
  models: Array<CatalogModel>,
  errors: Array<string>,
) {
  if (models.length) {
    return null;
  }
  if (isError) {
    return "Could not load models. Try again.";
  }
  if (!errors.length) {
    return null;
  }
  return errors.length === 1 ? errors[0] : "Could not load models. Try again.";
}

export function useModelsCatalog(agent: AgentPrefs) {
  const connections = useQuery({
    queryKey: ["agent-provider-connections"],
    queryFn: async () =>
      keyRowsSchema.parse(await window.pond.query("agent.keys", {})),
    staleTime: 15 * 60_000,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const connected = ASSISTANT_MODELS.filter(
    (entry) =>
      !connections.isError &&
      connections.data?.some(
        (row) => row.provider === entry.id && row.hasKey && row.enabled,
      ),
  );
  const queries = useQueries({
    queries: connected.map((entry) => ({
      queryKey: ["all-provider-models", entry.id],
      queryFn: async () =>
        window.pond.query("agent.listModels", { provider: entry.id }),
      staleTime: 15 * 60_000,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });
  const pending = queries.some((query) => query.isPending);
  const rows = connected.flatMap((entry, index) => {
    const query = queries[index];
    if (!query || query.isPending) {
      return [];
    }
    return [
      {
        provider: entry.id,
        providerName: entry.provider,
        models: query?.data?.models ?? [],
        error: query?.isError
          ? `Could not load models from ${entry.provider}. Try again.`
          : query.data &&
            (query.data.ok ? query.data.warning : query.data.error),
      },
    ];
  });
  const models: Array<CatalogModel> = rows
    .flatMap((row) => {
      const listed = row.models ?? [];
      const customIds = agent.customModelIds?.[row.provider] ?? [];
      const visibleIds = agent.visibleModelIds?.[row.provider];
      return modelsForChooser(listed, [
        ...listed.map((model) => model.id),
        ...customIds,
        ...(visibleIds ?? []),
      ]).map((model) => ({
        ...model,
        provider: row.provider,
        providerName: row.providerName,
      }));
    })
    .sort(
      (a, b) =>
        a.providerName.localeCompare(b.providerName) ||
        a.name.localeCompare(b.name),
    );
  const errors = uniqueErrors(rows);
  const loadError = connections.isError
    ? "Could not load providers. Try again."
    : catalogLoadError(
        queries.length > 0 && queries.every((query) => query.isError),
        models,
        errors,
      );
  const retry = () => {
    void connections.refetch();
    for (const query of queries) {
      void query.refetch();
    }
  };
  return {
    connectionsPending: connections.isPending,
    pending,
    models,
    errors,
    loadError,
    retry,
  };
}

import type {
  RuleApplyState,
  RuleInput,
  RuleList,
  RuleRunEntry,
  RuleWriteResult,
} from "@shared/rule-contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const RULES_KEY = ["rules.list"] as const;
const EMPTY: RuleList = { rules: [], unreadable: 0, autoTags: [] };

/** Runs land as Saves arrive, so the list refreshes while it's on screen. */
export interface RuleListState {
  list: RuleList;
  loaded: boolean;
  error: boolean;
}

export function useRuleList(): RuleListState {
  const query = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => window.pond.query("rules.list", {}),
    refetchInterval: 5000,
  });
  return {
    list: query.data ?? EMPTY,
    loaded: query.isFetched,
    error: query.isError,
  };
}

export interface RuleActivityState {
  runs: Array<RuleRunEntry>;
  loaded: boolean;
}

export function useRuleActivity(id: string | null): RuleActivityState {
  const query = useQuery({
    queryKey: ["rules.activity", id],
    queryFn: () =>
      id ? window.pond.query("rules.activity", { id, limit: 200 }) : [],
    enabled: id !== null,
    refetchInterval: 5000,
  });
  return { runs: query.data ?? [], loaded: query.isFetched };
}

export function useApplyState(): RuleApplyState {
  const query = useQuery({
    queryKey: ["rules.applyState"],
    queryFn: () => window.pond.query("rules.applyState", {}),
    refetchInterval: (current) =>
      current.state.data?.status === "running" ? 400 : 4000,
  });
  return query.data ?? { status: "idle" };
}

export interface RuleWrites {
  create(rule: RuleInput): Promise<RuleWriteResult>;
  update(id: string, rule: RuleInput): Promise<RuleWriteResult>;
  setEnabled(id: string, enabled: boolean): Promise<RuleWriteResult>;
  duplicate(id: string): Promise<RuleWriteResult>;
  remove(id: string): Promise<{ ok: true } | { ok: false; error: string }>;
  applyToExisting(
    id: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Every write refreshes the list, so switches and names never lag behind main. */
export function useRuleWrites(): RuleWrites {
  const client = useQueryClient();
  const after = useCallback(
    async <T>(result: Promise<T>): Promise<T> => {
      const value = await result;
      await client.invalidateQueries({ queryKey: RULES_KEY });
      await client.invalidateQueries({ queryKey: ["rules.applyState"] });
      return value;
    },
    [client],
  );
  return {
    create: (rule) => after(window.pond.query("rules.create", { rule })),
    update: (id, rule) =>
      after(window.pond.query("rules.update", { id, rule })),
    setEnabled: (id, enabled) =>
      after(window.pond.query("rules.setEnabled", { id, enabled })),
    duplicate: (id) => after(window.pond.query("rules.duplicate", { id })),
    remove: (id) => after(window.pond.query("rules.delete", { id })),
    applyToExisting: (id) =>
      after(window.pond.query("rules.applyToExisting", { id })),
  };
}

import type { Clause, FieldId, Query } from "@pond/schema/filters/types";
import { useCallback } from "react";
import { newRule } from "./query";

interface RuleGroupEditor {
  addGroup: () => void;
  addRule: () => void;
  insertRule: (index: number) => void;
  removeRule: (index: number) => void;
  setCombinator: (combinator: Query["combinator"]) => void;
  setTruth: (truth: "true" | "false") => void;
  updateRule: (index: number, clause: Clause) => void;
}

export function useRuleGroup(
  query: Query,
  onChange: (query: Query) => void,
  firstField?: FieldId,
): RuleGroupEditor {
  const updateRule = useCallback(
    (index: number, clause: Clause) =>
      onChange({
        ...query,
        rules: query.rules.map((rule, position) =>
          position === index ? clause : rule,
        ),
      }),
    [onChange, query],
  );
  const removeRule = useCallback(
    (index: number) =>
      onChange({
        ...query,
        rules: query.rules.filter((_, position) => position !== index),
      }),
    [onChange, query],
  );
  const addGroup = useCallback(
    () =>
      onChange({
        ...query,
        rules: [
          ...query.rules,
          {
            id: crypto.randomUUID(),
            combinator: "and",
            rules: [newRule(firstField)],
          },
        ],
      }),
    [onChange, query, firstField],
  );
  const addRule = useCallback(
    () => onChange({ ...query, rules: [...query.rules, newRule(firstField)] }),
    [onChange, query, firstField],
  );
  const insertRule = useCallback(
    (index: number) =>
      onChange({
        ...query,
        rules: [
          ...query.rules.slice(0, index + 1),
          newRule(firstField),
          ...query.rules.slice(index + 1),
        ],
      }),
    [onChange, query, firstField],
  );
  const setCombinator = useCallback(
    (combinator: Query["combinator"]) => onChange({ ...query, combinator }),
    [onChange, query],
  );
  const setTruth = useCallback(
    (truth: "true" | "false") => onChange({ ...query, not: truth === "false" }),
    [onChange, query],
  );

  return {
    addGroup,
    addRule,
    insertRule,
    removeRule,
    setCombinator,
    setTruth,
    updateRule,
  };
}

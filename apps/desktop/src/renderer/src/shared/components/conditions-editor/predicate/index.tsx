import { IconMinus, IconPlus } from "@pond/icons";
import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import type { Predicate as PredicateClause } from "@pond/schema/filters/types";
import { Button } from "@pond/ui";
import { OPERATOR_LABELS } from "../predicate-helpers";
import { defaultRuleValue, newRule } from "../query";
import { RuleSelect } from "../rule-select";
import { RuleValue } from "../rule-value";
import type { ConditionOptions, RuleChoices } from "../types";
import styles from "./styles.module.css";

interface PredicateProps {
  rule: PredicateClause;
  index: number;
  choices: RuleChoices;
  options?: ConditionOptions;
  onChange: (rule: PredicateClause) => void;
  onInsert: () => void;
  onRemove: () => void;
}

export function Predicate({
  rule,
  index,
  choices,
  options,
  onChange,
  onInsert,
  onRemove,
}: PredicateProps) {
  const number = index + 1;
  const noun = options?.noun ?? "Rule";
  const fields = options?.fields
    ? options.fields.map((id) => FIELD_DESCRIPTORS[id])
    : Object.values(FIELD_DESCRIPTORS);
  return (
    <div className={styles.root}>
      <RuleSelect.Single
        value={rule.field}
        label={`${noun} ${number} Field`}
        items={fields.map(({ id, label }) => ({
          value: id,
          label,
        }))}
        onChange={(field) => onChange({ ...newRule(field), id: rule.id })}
      />
      <RuleSelect.Single
        value={rule.operator}
        label={`${noun} ${number} Operator`}
        items={FIELD_DESCRIPTORS[rule.field].comparators.map((operator) => ({
          value: operator,
          label: OPERATOR_LABELS[operator] ?? operator,
        }))}
        onChange={(operator) =>
          onChange({
            ...rule,
            operator,
            value: defaultRuleValue(operator),
          })
        }
      />
      <div className={styles.value}>
        <RuleValue
          rule={rule}
          choices={choices}
          onChange={(value) => onChange({ ...rule, value })}
        />
      </div>
      <Button
        size="sm"
        variant={rule.negate ? "secondary" : "ghost"}
        aria-label={`Negate ${noun} ${number}`}
        aria-pressed={Boolean(rule.negate)}
        onClick={() => onChange({ ...rule, negate: !rule.negate })}
      >
        Not
      </Button>
      <Button
        icon
        size="xs"
        variant="ghost"
        aria-label={`Remove ${noun} ${number}`}
        onClick={onRemove}
      >
        <IconMinus size={12} />
      </Button>
      <Button
        icon
        size="xs"
        variant="secondary"
        aria-label={`Add ${noun} after ${noun} ${number}`}
        onClick={onInsert}
      >
        <IconPlus size={12} />
      </Button>
    </div>
  );
}

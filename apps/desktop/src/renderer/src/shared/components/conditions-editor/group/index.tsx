import { IconMinus, IconPlus } from "@pond/icons";
import { isGroup } from "@pond/schema/filters/types";
import type { Query } from "@pond/schema/filters/types";
import { Button } from "@pond/ui";
import { useId } from "react";
import { Predicate } from "../predicate";
import { RuleSelect } from "../rule-select";
import type { ConditionOptions, RuleChoices } from "../types";
import { useRuleGroup } from "../use-rule-group";
import styles from "./styles.module.css";

interface GroupProps {
  query: Query;
  choices: RuleChoices;
  onChange: (query: Query) => void;
  onRemove?: () => void;
  path: string;
  options?: ConditionOptions;
}

export function Group({
  query,
  choices,
  onChange,
  onRemove,
  path,
  options,
}: GroupProps) {
  const labelId = useId();
  const noun = options?.noun ?? "Rule";
  const editor = useRuleGroup(query, onChange, options?.fields?.[0]);
  return (
    <fieldset className={styles.root} aria-labelledby={labelId}>
      <legend id={labelId} className={styles["sr-only"]}>
        {path}
      </legend>
      <div className={styles.header}>
        <RuleSelect.Single
          value={query.combinator}
          label={`${path} Match`}
          width="content"
          items={[
            { value: "or", label: "Any" },
            { value: "and", label: "All" },
          ]}
          onChange={editor.setCombinator}
        />
        <span>of the following are</span>
        <RuleSelect.Single
          value={query.not ? "false" : "true"}
          label={`${path} Truth`}
          width="content"
          items={[
            { value: "true", label: "true" },
            { value: "false", label: "false" },
          ]}
          onChange={editor.setTruth}
        />
        <span className={styles.spacer} />
        {onRemove ? (
          <Button
            icon
            size="xs"
            variant="secondary"
            aria-label={`Remove ${path}`}
            onClick={onRemove}
          >
            <IconMinus size={12} />
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={editor.addGroup}>
          Add {noun} Group
        </Button>
        <Button
          icon
          size="xs"
          variant="secondary"
          aria-label={`Add ${noun} to ${path}`}
          onClick={editor.addRule}
        >
          <IconPlus size={12} />
        </Button>
      </div>
      <div className={styles.rules}>
        {query.rules.map((rule, index) => (
          <div key={rule.id} className={styles.rule}>
            {isGroup(rule) ? (
              <Group
                query={rule}
                choices={choices}
                path={`${path} Group ${index + 1}`}
                options={options}
                onChange={(next) => editor.updateRule(index, next)}
                onRemove={() => editor.removeRule(index)}
              />
            ) : (
              <Predicate
                rule={rule}
                index={index}
                choices={choices}
                options={options}
                onChange={(next) => editor.updateRule(index, next)}
                onRemove={() => editor.removeRule(index)}
                onInsert={() => editor.insertRule(index)}
              />
            )}
          </div>
        ))}
        {query.rules.length === 0 ? (
          <p className={styles["no-value"]}>
            All saves match. Add a {noun.toLowerCase()} to narrow the results.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

import type { FieldId } from "@pond/schema/filters/types";

export interface RuleChoice {
  value: string;
  label: string;
  /** Parent folder or tag group, shown the same way as the other choice lists. */
  crumb?: string;
}

export interface RuleChoices {
  folders: ReadonlyArray<RuleChoice>;
  tags: ReadonlyArray<RuleChoice>;
}

export interface ConditionOptions {
  fields?: ReadonlyArray<FieldId>;
  /** Singular noun for one condition in labels, like "Rule" or "Condition". */
  noun?: string;
}

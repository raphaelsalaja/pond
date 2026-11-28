import type { RuleChoice as InternalRuleChoice } from "./types";

export { ruleChoices } from "./choices";
export { RuleEditor } from "./editor";
export { RuleSelect } from "./rule-select";
export {
  compileRuleQuery,
  editableQuery,
  newRule,
  ruleQueryReady,
} from "./query";

export type RuleChoice = InternalRuleChoice;

export interface RuleChoices {
  folders: ReadonlyArray<RuleChoice>;
  tags: ReadonlyArray<RuleChoice>;
}

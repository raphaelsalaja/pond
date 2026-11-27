import type { Query } from "@pond/schema/filters/types";
import { Group } from "../group";
import type { ConditionOptions, RuleChoices } from "../types";

interface RuleEditorProps {
  query: Query;
  choices: RuleChoices;
  onChange: (query: Query) => void;
  onRemove?: () => void;
  path?: string;
  /** Fields offered in the field menu and noun used in labels; Smart Folders use every field and "Rule". */
  options?: ConditionOptions;
}

export function RuleEditor({
  query,
  choices,
  onChange,
  onRemove,
  path = "Rules",
  options,
}: RuleEditorProps) {
  return (
    <Group
      query={query}
      choices={choices}
      onChange={onChange}
      onRemove={onRemove}
      path={path}
      options={options}
    />
  );
}

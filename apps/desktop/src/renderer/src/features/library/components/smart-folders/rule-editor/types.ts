export interface RuleChoice {
  value: string;
  label: string;
  /** Parent folder or tag group, shown the same way as the other choice lists. */
  crumb?: string;
}

export interface RuleChoices {
  folders: readonly RuleChoice[];
  tags: readonly RuleChoice[];
}

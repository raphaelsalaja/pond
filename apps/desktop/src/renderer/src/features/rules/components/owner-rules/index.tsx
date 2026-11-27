import { Button, Settings, Switch } from "@pond/ui";
import type { Rule, RuleInput } from "@shared/rule-contracts";
import { RULE_CHANNELS } from "@shared/rule-contracts";
import { useState } from "react";
import { openSettings } from "@/shared/lib/open-settings";
import { notify } from "@/shared/lib/toast";
import { useRuleNames } from "../../hooks/use-rule-names";
import { emptyRule } from "../../lib/draft";
import { summarizeRule } from "../../lib/summary";
import { useRuleList, useRuleWrites } from "../../state/rules";
import { RuleDialog } from "../rule-dialog";
import styles from "./styles.module.css";

/** The Rules that file what one Account or Watch brings in, where its other settings live. */
export function OwnerRules({
  ownerId,
  ownerName,
}: {
  ownerId: string;
  ownerName: string;
}) {
  const { list, loaded } = useRuleList();
  const writes = useRuleWrites();
  const names = useRuleNames();
  const [editing, setEditing] = useState<{
    rule: Rule | null;
    initial: RuleInput;
  } | null>(null);
  const owned = list.rules.filter(
    (entry) =>
      entry.rule.trigger.kind === "newSave" &&
      entry.rule.trigger.ownerId === ownerId,
  );
  const create = (): RuleInput => ({
    ...emptyRule(),
    name: `New from ${ownerName}`.slice(0, 80),
    trigger: { kind: "newSave", channels: [...RULE_CHANNELS], ownerId },
  });
  return (
    <div className={styles.root}>
      <p className={styles.intro}>
        Rules file Saves from {ownerName} into folders and tags as they arrive.
      </p>
      {loaded && owned.length ? (
        <Settings.List>
          {owned.map((entry) => (
            <Settings.Item key={entry.rule.id}>
              <Settings.ItemDetails>
                <Settings.ItemTitle>{entry.rule.name}</Settings.ItemTitle>
                <Settings.ItemDescription>
                  {summarizeRule(entry.rule, names)}
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl className={styles.controls}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({ rule: entry.rule, initial: entry.rule })
                  }
                >
                  Edit
                </Button>
                <Switch.Root
                  aria-label={`Turn ${entry.rule.name} ${entry.rule.enabled ? "Off" : "On"}`}
                  checked={entry.rule.enabled}
                  onCheckedChange={(enabled) => {
                    void writes
                      .setEnabled(entry.rule.id, enabled)
                      .then((result) => {
                        if (!result.ok)
                          notify({ id: "rules-error", title: result.error });
                      });
                  }}
                />
              </Settings.ItemControl>
            </Settings.Item>
          ))}
        </Settings.List>
      ) : null}
      <div className={styles.actions}>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setEditing({ rule: null, initial: create() })}
        >
          New Rule
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openSettings("rules")}>
          All Rules
        </Button>
      </div>
      {editing ? (
        <RuleDialog
          rule={editing.rule}
          initial={editing.initial}
          onSave={async (input) => {
            const result = editing.rule
              ? await writes.update(editing.rule.id, input)
              : await writes.create(input);
            if (!result.ok) throw new Error(result.error);
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

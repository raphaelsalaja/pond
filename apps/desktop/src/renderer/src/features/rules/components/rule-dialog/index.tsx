import { IconMinus } from "@pond/icons";
import type { InboxChannel } from "@pond/schema/inbox";
import { Button, Checkbox, Dialog, Field, Input, Menu, Select } from "@pond/ui";
import type {
  Rule,
  RuleAction,
  RuleInput,
  RulePreview,
  RuleSavePick,
  RuleTestResult,
  RuleTrigger,
} from "@shared/rule-contracts";
import {
  RULE_ACTION_CAP,
  RULE_CHANNEL_LABELS,
  RULE_CHANNELS,
  RULE_FIELDS,
} from "@shared/rule-contracts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFolders } from "@/features/library";
import { useTagGroups, useTags } from "@/features/tags";
import {
  RuleEditor,
  RuleSelect,
  ruleChoices,
} from "@/shared/components/conditions-editor";
import type { RuleChoices } from "@/shared/components/conditions-editor";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { useRuleNames, useRuleOwners } from "../../hooks/use-rule-names";
import {
  ACTION_LABELS,
  RULE_ACTION_KINDS,
  draftProblem,
  editableRule,
  newAction,
  prepareRule,
} from "../../lib/draft";
import type { DraftProblem } from "../../lib/draft";
import { describeChange, summarizeRule } from "../../lib/summary";
import type { RuleNames } from "../../lib/summary";
import styles from "./styles.module.css";

const ANY_OWNER = "any";

const PROBLEM_COPY: Record<DraftProblem, string> = {
  name: "Name the Rule.",
  trigger: "Choose when the Rule runs.",
  conditions: "Complete every condition.",
  actions: "Complete every action.",
};

export interface RuleDialogProps {
  /** The stored Rule being edited, or null for a new one. */
  rule: Rule | null;
  initial: RuleInput;
  onSave: (rule: RuleInput) => Promise<void>;
  onApply?: (rule: Rule, preview: RulePreview) => void;
  onClose: () => void;
}

export function RuleDialog({
  rule,
  initial,
  onSave,
  onApply,
  onClose,
}: RuleDialogProps) {
  const [draft, setDraft] = useState<RuleInput>(() => editableRule(initial));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<DraftProblem | null>(null);
  const pending = useRef(false);
  const names = useRuleNames();
  const folders = useFolders();
  const tags = useTags();
  const tagGroups = useTagGroups();
  const choices = useMemo(
    () => ruleChoices({ folders, tags, tagGroups }),
    [folders, tags, tagGroups],
  );
  useLayoutEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- The dialog mounts closed and opens before paint so its enter transition runs.
    setOpen(true);
  }, []);

  const problem = draftProblem(draft);
  const summary =
    problem && problem !== "name" ? null : summarizeRule(draft, names);
  const unchanged =
    rule !== null &&
    JSON.stringify(prepareRuleSafely(draft)) ===
      JSON.stringify(prepareRuleSafely(rule));

  const submit = async () => {
    if (pending.current) return;
    setShown(problem);
    if (problem) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSave(prepareRule(draft));
      setOpen(false);
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't save this Rule. Try again."));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        if (pending.current) details.cancel();
        else setOpen(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <form
            className={styles.form}
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>{rule ? "Edit Rule" : "New Rule"}</Dialog.Title>
            </Dialog.Header>
            <div className={styles.body} data-scroll-fade="vertical">
              <Field.Root
                className={styles.name}
                invalid={
                  shown === "name" && problem === "name" ? true : undefined
                }
              >
                <Field.Label>Rule Name</Field.Label>
                <Input.Root size="sm">
                  <Field.Control
                    render={<Input.Field autoFocus={!rule} />}
                    value={draft.name}
                    disabled={busy}
                    onValueChange={(name) =>
                      setDraft((current) => ({ ...current, name }))
                    }
                  />
                </Input.Root>
              </Field.Root>
              <Dialog.Description className={styles.description}>
                Rules organize Saves on their own. They only add folders, tags,
                and marks; they never remove anything.
              </Dialog.Description>

              <ol className={styles.steps}>
                <Step
                  title="When"
                  invalid={shown === "trigger" && problem === "trigger"}
                >
                  <TriggerCard
                    trigger={draft.trigger}
                    choices={choices}
                    disabled={busy}
                    onChange={(trigger) =>
                      setDraft((current) => ({ ...current, trigger }))
                    }
                  />
                </Step>
                <Step
                  title="If"
                  invalid={shown === "conditions" && problem === "conditions"}
                >
                  <fieldset className={styles.conditions} disabled={busy}>
                    <legend className={styles.hidden}>Conditions</legend>
                    <RuleEditor
                      query={draft.conditions}
                      choices={choices}
                      path="Conditions"
                      options={{ fields: RULE_FIELDS, noun: "Condition" }}
                      onChange={(conditions) =>
                        setDraft((current) => ({ ...current, conditions }))
                      }
                    />
                  </fieldset>
                </Step>
                <Step
                  title="Then"
                  invalid={shown === "actions" && problem === "actions"}
                >
                  <ActionsCard
                    actions={draft.actions}
                    choices={choices}
                    disabled={busy}
                    onChange={(actions) =>
                      setDraft((current) => ({ ...current, actions }))
                    }
                  />
                </Step>
                <Step title="Review">
                  <ReviewCard
                    draft={draft}
                    rule={rule}
                    summary={summary}
                    names={names}
                    ready={problem === null || problem === "name"}
                    unchanged={unchanged}
                    onApply={onApply}
                  />
                </Step>
              </ol>
              {shown && problem ? (
                <p role="alert" className={styles.error}>
                  {PROBLEM_COPY[problem]}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              ) : null}
            </div>
            <Dialog.Footer
              leading={
                <CheckRow
                  className={styles.enabled}
                  checked={draft.enabled}
                  disabled={busy}
                  onChange={(enabled) =>
                    setDraft((current) => ({ ...current, enabled }))
                  }
                >
                  Turn On
                </CheckRow>
              }
            >
              <Dialog.Cancel disabled={busy} />
              <Button
                type="submit"
                variant="primary"
                disabled={busy}
                loading={busy}
              >
                {rule ? "Save" : "Create"}
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function prepareRuleSafely(rule: RuleInput): RuleInput | null {
  try {
    return prepareRule({ ...rule, enabled: true });
  } catch {
    return null;
  }
}

function CheckRow({
  checked,
  disabled,
  className,
  onChange,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <label className={className ?? styles.check} htmlFor={id}>
      <Checkbox.Root
        id={id}
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      >
        <Checkbox.Indicator />
      </Checkbox.Root>
      <span>{children}</span>
    </label>
  );
}

function Step({
  title,
  invalid,
  children,
}: {
  title: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={styles.step} data-invalid={invalid || undefined}>
      <h3 className={styles["step-title"]}>{title}</h3>
      <div className={styles.card}>{children}</div>
    </li>
  );
}

function TriggerCard({
  trigger,
  choices,
  disabled,
  onChange,
}: {
  trigger: RuleTrigger;
  choices: RuleChoices;
  disabled: boolean;
  onChange: (trigger: RuleTrigger) => void;
}) {
  const owners = useRuleOwners();
  const kinds = [
    { value: "newSave" as const, label: "A new Save arrives" },
    { value: "addedToFolder" as const, label: "A Save is added to a folder" },
  ];
  return (
    <div className={styles.rows}>
      <RuleSelect.Single
        value={trigger.kind}
        label="Trigger"
        items={kinds}
        onChange={(kind) =>
          onChange(
            kind === trigger.kind
              ? trigger
              : kind === "newSave"
                ? { kind, channels: [...RULE_CHANNELS], ownerId: null }
                : { kind, folderId: "", includeSubfolders: false },
          )
        }
      />
      {trigger.kind === "newSave" ? (
        <>
          <fieldset className={styles.channels} disabled={disabled}>
            <legend className={styles.label}>Through</legend>
            {RULE_CHANNELS.map((channel: InboxChannel) => (
              <CheckRow
                key={channel}
                checked={trigger.channels.includes(channel)}
                onChange={(checked) =>
                  onChange({
                    ...trigger,
                    channels: checked
                      ? RULE_CHANNELS.filter(
                          (each) =>
                            each === channel || trigger.channels.includes(each),
                        )
                      : trigger.channels.filter((each) => each !== channel),
                  })
                }
              >
                {RULE_CHANNEL_LABELS[channel]}
              </CheckRow>
            ))}
          </fieldset>
          <div className={styles.inline}>
            <span className={styles.label}>From</span>
            <RuleSelect.Single
              value={trigger.ownerId ?? ANY_OWNER}
              label="From Account or Watch"
              items={[
                { value: ANY_OWNER, label: "Any Account or Watch" },
                ...owners.map((owner) => ({
                  value: owner.id,
                  label: owner.label,
                })),
              ]}
              onChange={(value) =>
                onChange({
                  ...trigger,
                  ownerId: value === ANY_OWNER ? null : value,
                })
              }
            />
          </div>
        </>
      ) : (
        <>
          <FolderSelect
            value={trigger.folderId}
            choices={choices}
            label="Trigger Folder"
            onChange={(folderId) => onChange({ ...trigger, folderId })}
          />
          <CheckRow
            disabled={disabled}
            checked={trigger.includeSubfolders}
            onChange={(includeSubfolders) =>
              onChange({ ...trigger, includeSubfolders })
            }
          >
            Include folders inside it
          </CheckRow>
          <p className={styles.hint}>
            Changes Rules make never start another Rule, so Rules can’t loop.
          </p>
        </>
      )}
    </div>
  );
}

function FolderSelect({
  value,
  choices,
  label,
  onChange,
}: {
  value: string;
  choices: RuleChoices;
  label: string;
  onChange: (folderId: string) => void;
}) {
  const items = choices.folders.map((choice) => ({
    value: choice.value,
    label: choice.crumb ? `${choice.crumb} › ${choice.label}` : choice.label,
  }));
  return (
    <Select.Root
      value={value || null}
      items={items}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <Select.Trigger size="sm" width="full" aria-label={label}>
        <Select.Value placeholder="Choose a Folder" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ActionsCard({
  actions,
  choices,
  disabled,
  onChange,
}: {
  actions: Array<RuleAction>;
  choices: RuleChoices;
  disabled: boolean;
  onChange: (actions: Array<RuleAction>) => void;
}) {
  const reduce = useReducedMotion();
  const kinds = RULE_ACTION_KINDS.map((kind) => ({
    value: kind,
    label: ACTION_LABELS[kind],
  }));
  const update = (index: number, next: RuleAction) =>
    onChange(
      actions.map((action, position) => (position === index ? next : action)),
    );
  return (
    <div className={styles.rows}>
      <AnimatePresence initial={false}>
        {actions.map((action, index) => (
          <motion.div
            // oxlint-disable-next-line react/no-array-index-key -- Actions have no identity of their own; position is what the person edits.
            key={index}
            className={styles.action}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          >
            <RuleSelect.Single
              value={action.kind}
              label={`Action ${index + 1}`}
              items={kinds}
              onChange={(kind) => update(index, newAction(kind))}
            />
            <div className={styles.value}>
              <ActionValue
                action={action}
                index={index}
                choices={choices}
                onChange={(next) => update(index, next)}
              />
            </div>
            <Button
              icon
              size="xs"
              variant="ghost"
              disabled={disabled || actions.length === 1}
              aria-label={`Remove Action ${index + 1}`}
              onClick={() =>
                onChange(actions.filter((_, position) => position !== index))
              }
            >
              <IconMinus size={12} />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>
      <Menu.Root>
        <Menu.Trigger
          variant="secondary"
          size="sm"
          disabled={disabled || actions.length >= RULE_ACTION_CAP}
        >
          Add Action
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start">
            <Menu.Popup>
              <Menu.List>
                {kinds.map((kind) => (
                  <Menu.Item
                    key={kind.value}
                    onClick={() =>
                      onChange([...actions, newAction(kind.value)])
                    }
                  >
                    <Menu.ItemLabel>{kind.label}</Menu.ItemLabel>
                  </Menu.Item>
                ))}
              </Menu.List>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

function ActionValue({
  action,
  index,
  choices,
  onChange,
}: {
  action: RuleAction;
  index: number;
  choices: RuleChoices;
  onChange: (action: RuleAction) => void;
}) {
  const [typed, setTyped] = useState("");
  switch (action.kind) {
    case "addToFolder":
      return (
        <FolderSelect
          value={action.folderId}
          choices={choices}
          label={`Action ${index + 1} Folder`}
          onChange={(folderId) => onChange({ ...action, folderId })}
        />
      );
    case "addTags": {
      const known = new Set(
        choices.tags.map((choice) => choice.value.toLowerCase()),
      );
      const extra = action.tags
        .filter((tag) => !known.has(tag.toLowerCase()))
        .map((tag) => ({ value: tag, label: tag }));
      const add = () => {
        const tag = typed.trim();
        if (!tag) return;
        if (
          !action.tags.some((each) => each.toLowerCase() === tag.toLowerCase())
        ) {
          onChange({ ...action, tags: [...action.tags, tag] });
        }
        setTyped("");
      };
      return (
        <div className={styles.tags}>
          <RuleSelect.Multiple
            value={action.tags}
            items={[...choices.tags, ...extra]}
            label={`Action ${index + 1} Tags`}
            placeholder="Choose Tags"
            onChange={(tags) => onChange({ ...action, tags })}
          />
          <Input.Root size="sm" className={styles["new-tag"]}>
            <Input.Field
              aria-label={`New Tag for Action ${index + 1}`}
              placeholder="New Tag"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
            />
          </Input.Root>
        </div>
      );
    }
    case "favorite":
      return <span className={styles.hint}>Marks the Save as a favorite.</span>;
    case "rating":
      return (
        <RuleSelect.Single
          value={String(action.rating)}
          label={`Action ${index + 1} Rating`}
          items={[1, 2, 3, 4, 5].map((stars) => ({
            value: String(stars),
            label: formatPlural(stars, { one: "Star", other: "Stars" }),
          }))}
          onChange={(rating) => onChange({ ...action, rating: Number(rating) })}
        />
      );
    case "inbox":
      return (
        <RuleSelect.Single
          value={action.state}
          label={`Action ${index + 1} Inbox`}
          items={[
            { value: "review" as const, label: "Send to the Inbox" },
            { value: "processed" as const, label: "Mark Processed" },
          ]}
          onChange={(state) => onChange({ ...action, state })}
        />
      );
  }
}

function ReviewCard({
  draft,
  rule,
  summary,
  names,
  ready,
  unchanged,
  onApply,
}: {
  draft: RuleInput;
  rule: Rule | null;
  summary: string | null;
  names: RuleNames;
  ready: boolean;
  unchanged: boolean;
  onApply?: (rule: Rule, preview: RulePreview) => void;
}) {
  const [test, setTest] = useState<RuleTestResult | null>(null);
  const [testing, setTesting] = useState<RuleSavePick | null>(null);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const draftKey = JSON.stringify(draft);
  const [resultKey, setResultKey] = useState(draftKey);
  if (resultKey !== draftKey) {
    setResultKey(draftKey);
    setTest(null);
    setPreview(null);
  }

  const runTest = async (save: RuleSavePick) => {
    setTesting(save);
    setFailure(null);
    try {
      setTest(
        await window.pond.query("rules.test", {
          rule: prepareRule(draft),
          saveId: save.id,
        }),
      );
    } catch (cause) {
      setFailure(errorCopy(cause, "Couldn't test this Rule."));
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    setFailure(null);
    try {
      setPreview(
        await window.pond.query("rules.preview", { rule: prepareRule(draft) }),
      );
    } catch (cause) {
      setFailure(errorCopy(cause, "Couldn't preview this Rule."));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className={styles.rows}>
      <p className={styles.summary} aria-live="polite">
        {summary ?? "Complete the steps above to see what this Rule does."}
      </p>
      <div className={styles.inline}>
        <SavePicker disabled={!ready} onPick={(save) => void runTest(save)} />
        <Button
          size="sm"
          variant="secondary"
          disabled={!ready || previewing}
          loading={previewing}
          onClick={() => void runPreview()}
        >
          Preview in Library
        </Button>
      </div>
      {failure ? (
        <p role="alert" className={styles.error}>
          {failure}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {test && testing ? (
          <motion.div
            key="test"
            className={styles.result}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <TestResult
              result={test}
              save={testing}
              draft={draft}
              names={names}
            />
          </motion.div>
        ) : null}
        {preview ? (
          <motion.div
            key="preview"
            className={styles.result}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <PreviewResult preview={preview} names={names} />
            {rule && onApply && unchanged && preview.wouldChange > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onApply(rule, preview)}
              >
                Apply to{" "}
                {formatPlural(preview.wouldChange, {
                  one: "Save",
                  other: "Saves",
                })}
                …
              </Button>
            ) : rule && onApply && !unchanged && preview.wouldChange > 0 ? (
              <p className={styles.hint}>
                Save your changes to apply this Rule to existing Saves.
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SavePicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (save: RuleSavePick) => void;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Array<RuleSavePick>>([]);
  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(() => {
      void window.pond.query("rules.searchSaves", { text }).then((rows) => {
        if (current) setResults(rows);
      });
    }, 150);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [text]);
  const items = results.map((save) => ({ value: save.id, label: save.title }));
  return (
    <div className={styles.picker}>
      <Input.Root size="sm">
        <Input.Field
          aria-label="Find a Save to Test"
          placeholder="Find a Save to Test"
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
      </Input.Root>
      <Select.Root
        value={null}
        items={items}
        disabled={disabled || !items.length}
        onValueChange={(id) => {
          const save = results.find((row) => row.id === id);
          if (save) onPick(save);
        }}
      >
        <Select.Trigger size="sm" aria-label="Test on a Save">
          <Select.Value placeholder="Test on a Save" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.Items items={items} />
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function TestResult({
  result,
  save,
  draft,
  names,
}: {
  result: RuleTestResult;
  save: RuleSavePick;
  draft: RuleInput;
  names: RuleNames;
}) {
  return (
    <div className={styles.report} role="status">
      <p className={styles["report-title"]}>
        {result.matched ? "Matches" : "Doesn't match"} “{save.title}”
      </p>
      <ul className={styles.checks}>
        <li data-pass={result.trigger.applies ?? undefined}>
          {result.trigger.reason}
        </li>
        {result.conditions.map((condition) => {
          const clause = draft.conditions.rules[condition.index];
          return clause ? (
            <li key={condition.index} data-pass={condition.passed}>
              {condition.passed ? "Passes" : "Fails"}: {names.predicate(clause)}
            </li>
          ) : null;
        })}
        {result.matched
          ? result.changes.map((change) => (
              <li key={JSON.stringify(change)}>
                Would be {describeChange(change, names).toLowerCase()}
              </li>
            ))
          : null}
        {result.matched && !result.changes.length ? (
          <li>Already organized; nothing would change.</li>
        ) : null}
      </ul>
    </div>
  );
}

function PreviewResult({
  preview,
  names,
}: {
  preview: RulePreview;
  names: RuleNames;
}) {
  return (
    <div className={styles.report} role="status">
      <p className={styles["report-title"]}>
        {formatPlural(preview.matched, {
          one: "Save matches",
          other: "Saves match",
        })}
        {preview.matched
          ? `, ${formatPlural(preview.wouldChange, { one: "would change", other: "would change" })}`
          : ""}
      </p>
      <ul className={styles.checks}>
        {preview.actions.map((entry, index) => (
          <li
            // oxlint-disable-next-line react/no-array-index-key -- One line per action, in the Rule's order.
            key={index}
          >
            {summarizeAction(entry.action, names)}:{" "}
            {formatPlural(entry.wouldChange, { one: "Save", other: "Saves" })}
            {entry.already
              ? `, ${formatPlural(entry.already, { one: "already done", other: "already done" })}`
              : ""}
          </li>
        ))}
      </ul>
      <p className={styles.hint}>
        Previews check conditions only; existing Saves have no capture path on
        record.
      </p>
    </div>
  );
}

function summarizeAction(action: RuleAction, names: RuleNames): string {
  switch (action.kind) {
    case "addToFolder":
      return `Add to ${names.folder(action.folderId) ?? "a deleted folder"}`;
    case "addTags":
      return `Tag ${action.tags.join(", ")}`;
    default:
      return ACTION_LABELS[action.kind];
  }
}

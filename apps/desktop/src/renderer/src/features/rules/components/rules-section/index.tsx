import { IconDots as More, IconMagnifier as Magnifier } from "@pond/icons";
import {
  Button,
  Dialog,
  Input,
  Menu,
  Settings,
  Switch,
  Toggle,
  ToggleGroup,
} from "@pond/ui";
import type {
  Rule,
  RuleInput,
  RulePreview,
  RuleSummary,
} from "@shared/rule-contracts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RuleSelect } from "@/shared/components/conditions-editor";
import { formatPlural } from "@/shared/lib/format";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import { notify } from "@/shared/lib/toast";
import { notifyUndoable } from "@/shared/lib/undo-toast";
import { useRuleNames } from "../../hooks/use-rule-names";
import { emptyRule, RULE_STARTERS } from "../../lib/draft";
import { joinList, summarizeRule } from "../../lib/summary";
import type { RuleNames } from "../../lib/summary";
import { useApplyState, useRuleList, useRuleWrites } from "../../state/rules";
import { RuleActivity } from "../rule-activity";
import { RuleDialog } from "../rule-dialog";
import styles from "./styles.module.css";

type Filter = "all" | "on" | "off";

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
type Sort = "name" | "edited" | "run";

type Editing = { rule: Rule | null; initial: RuleInput } | null;

function statusLine(summary: RuleSummary): string {
  const { stats } = summary;
  if (summary.missingFolderIds.length) return "A folder it uses was deleted";
  if (stats.lastError && stats.lastErrorAt === stats.lastRunAt) {
    return `Failed ${relativeTimeFromMs(stats.lastErrorAt)}`;
  }
  if (!stats.lastRunAt) return "Never run";
  return `${formatPlural(stats.changed, { one: "Save organized", other: "Saves organized" })} · last run ${relativeTimeFromMs(stats.lastRunAt)}`;
}

function report(result: { ok: true } | { ok: false; error: string }): void {
  if (!result.ok)
    notify({ id: "rules-error", title: result.error, status: "error" });
}

export function RulesSection() {
  const { list, loaded, error } = useRuleList();
  const writes = useRuleWrites();
  const names = useRuleNames();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [editing, setEditing] = useState<Editing>(null);
  const [activity, setActivity] = useState<Rule | null>(null);
  const reduce = useReducedMotion();

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return list.rules
      .filter((entry) =>
        filter === "all"
          ? true
          : filter === "on"
            ? entry.rule.enabled
            : !entry.rule.enabled,
      )
      .filter(
        (entry) =>
          !term ||
          entry.rule.name.toLocaleLowerCase().includes(term) ||
          summarizeRule(entry.rule, names).toLocaleLowerCase().includes(term),
      )
      .toSorted((a, b) =>
        sort === "edited"
          ? b.rule.updatedAt - a.rule.updatedAt
          : sort === "run"
            ? (b.stats.lastRunAt ?? 0) - (a.stats.lastRunAt ?? 0)
            : a.rule.name.localeCompare(b.rule.name),
      );
  }, [list.rules, query, filter, sort, names]);

  const save = async (rule: Rule | null, input: RuleInput) => {
    const result = rule
      ? await writes.update(rule.id, input)
      : await writes.create(input);
    if (!result.ok) throw new Error(result.error);
  };

  const confirmApply = (rule: Rule, preview: RulePreview) => {
    Dialog.confirm({
      title: `Apply “${rule.name}” to Existing Saves`,
      description: `${formatPlural(preview.wouldChange, { one: "Save", other: "Saves" })} will change. This runs once and can be undone as one step.`,
      confirmLabel: "Apply",
      onConfirm: async () => {
        report(await writes.applyToExisting(rule.id));
      },
    });
  };

  const confirmDelete = (rule: Rule) => {
    Dialog.confirm({
      title: `Delete “${rule.name}”`,
      description: "Saves it already organized stay where they are.",
      confirmLabel: "Delete",
      confirmVariant: "destructive",
      onConfirm: async () => {
        report(await writes.remove(rule.id));
      },
    });
  };

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.HeaderText>
          <Settings.Title>Rules</Settings.Title>
          <Settings.Description>
            Organize new Saves automatically. Rules add folders, tags, and
            marks, and never remove anything.
          </Settings.Description>
        </Settings.HeaderText>
      </Settings.Header>

      <ApplyProgress rules={list.rules} />

      <div className={styles.toolbar}>
        <Input.Root className={styles.search} size="sm">
          <Input.Icon>
            <Magnifier size={12} />
          </Input.Icon>
          <Input.Field
            aria-label="Search Rules"
            placeholder="Search…"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Input.Root>
        <ToggleGroup
          aria-label="Show Rules"
          value={[filter]}
          onValueChange={(next) => {
            const value = FILTERS.find((item) => item.value === next[0]);
            if (value) setFilter(value.value);
          }}
        >
          {FILTERS.map(({ value, label }) => (
            <Toggle key={value} type="button" size="sm" value={value}>
              {label}
            </Toggle>
          ))}
        </ToggleGroup>
        <RuleSelect.Single
          value={sort}
          label="Sort Rules"
          width="content"
          items={[
            { value: "name" as const, label: "Name" },
            { value: "edited" as const, label: "Last Edited" },
            { value: "run" as const, label: "Last Run" },
          ]}
          onChange={setSort}
        />
        <span className={styles.spacer} />
        <Button
          variant="primary"
          size="sm"
          onClick={() => setEditing({ rule: null, initial: emptyRule() })}
        >
          New Rule
        </Button>
      </div>

      {error ? (
        <p role="alert" className={styles.empty}>
          Rules couldn’t be read.
        </p>
      ) : loaded && !list.rules.length ? (
        <div className={styles.starters}>
          <p className={styles.empty}>
            A Rule files new Saves for you: when a Save arrives and matches its
            conditions, Pond adds it to folders and tags. Start from one of
            these, or make your own.
          </p>
          <div className={styles["starter-list"]}>
            {RULE_STARTERS.map((starter) => (
              <Button
                key={starter.title}
                variant="secondary"
                size="sm"
                onClick={() =>
                  setEditing({ rule: null, initial: starter.rule })
                }
              >
                {starter.title}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <Settings.List className={styles.list}>
          <AnimatePresence initial={false}>
            {visible.map((entry) => (
              <motion.div
                key={entry.rule.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              >
                <RuleRow
                  entry={entry}
                  names={names}
                  onToggle={async (enabled) =>
                    report(await writes.setEnabled(entry.rule.id, enabled))
                  }
                  onEdit={() =>
                    setEditing({ rule: entry.rule, initial: entry.rule })
                  }
                  onDuplicate={async () =>
                    report(await writes.duplicate(entry.rule.id))
                  }
                  onActivity={() => setActivity(entry.rule)}
                  onDelete={() => confirmDelete(entry.rule)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {list.rules.length && !visible.length ? (
            <p className={styles.empty}>No Rules match.</p>
          ) : null}
        </Settings.List>
      )}
      {list.unreadable ? (
        <p className={styles.note}>
          {formatPlural(list.unreadable, {
            one: "Rule was made by a newer version of Pond and is kept as is.",
            other:
              "Rules were made by a newer version of Pond and are kept as is.",
          })}
        </p>
      ) : null}

      {list.autoTags.length ? (
        <Settings.Section>
          <Settings.SectionDetails>
            <Settings.SectionTitle>Folder Auto-Tags</Settings.SectionTitle>
            <Settings.SectionDescription>
              Tags a folder adds to every Save that enters it. Edit them from
              the folder.
            </Settings.SectionDescription>
          </Settings.SectionDetails>
          <Settings.List>
            {list.autoTags.map((entry) => (
              <Settings.Item key={entry.folderId}>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>
                    {names.folder(entry.folderId) ?? "Folder"}
                  </Settings.ItemTitle>
                  <Settings.ItemDescription>
                    Tags {joinList(entry.tags)}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
              </Settings.Item>
            ))}
          </Settings.List>
        </Settings.Section>
      ) : null}

      {editing ? (
        <RuleDialog
          rule={editing.rule}
          initial={editing.initial}
          onSave={(input) => save(editing.rule, input)}
          onApply={confirmApply}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {activity ? (
        <RuleActivity
          rule={activity}
          names={names}
          onClose={() => setActivity(null)}
        />
      ) : null}
    </Settings.Page>
  );
}

function RuleRow({
  entry,
  names,
  onToggle,
  onEdit,
  onDuplicate,
  onActivity,
  onDelete,
}: {
  entry: RuleSummary;
  names: RuleNames;
  onToggle: (enabled: boolean) => Promise<void>;
  onEdit: () => void;
  onDuplicate: () => Promise<void>;
  onActivity: () => void;
  onDelete: () => void;
}) {
  const { rule, stats } = entry;
  const warn =
    entry.missingFolderIds.length > 0 ||
    (stats.lastError !== null && stats.lastErrorAt === stats.lastRunAt);
  return (
    <Settings.Item
      className={styles.row}
      data-off={rule.enabled ? undefined : ""}
    >
      <Settings.ItemDetails>
        <Settings.ItemTitle>
          <button type="button" className={styles.name} onClick={onEdit}>
            {rule.name}
          </button>
        </Settings.ItemTitle>
        <Settings.ItemDescription className={styles.summary}>
          {summarizeRule(rule, names)}
        </Settings.ItemDescription>
        <span className={styles.status} data-warn={warn ? "" : undefined}>
          {rule.enabled ? statusLine(entry) : `Off · ${statusLine(entry)}`}
        </span>
      </Settings.ItemDetails>
      <Settings.ItemControl className={styles.controls}>
        <Menu.Root>
          <Menu.Trigger
            icon
            size="xs"
            variant="ghost"
            aria-label={`More for ${rule.name}`}
          >
            <More size={12} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end">
              <Menu.Popup>
                <Menu.List>
                  <Menu.Item onClick={onEdit}>
                    <Menu.ItemLabel>Edit and Test…</Menu.ItemLabel>
                  </Menu.Item>
                  <Menu.Item onClick={() => void onDuplicate()}>
                    <Menu.ItemLabel>Duplicate</Menu.ItemLabel>
                  </Menu.Item>
                  <Menu.Item onClick={onActivity}>
                    <Menu.ItemLabel>Activity…</Menu.ItemLabel>
                  </Menu.Item>
                  <Menu.Separator />
                  <Menu.Item onClick={onDelete}>
                    <Menu.ItemLabel>Delete…</Menu.ItemLabel>
                  </Menu.Item>
                </Menu.List>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <Switch.Root
          aria-label={`Turn ${rule.name} ${rule.enabled ? "Off" : "On"}`}
          checked={rule.enabled}
          onCheckedChange={(enabled) => void onToggle(enabled)}
        />
      </Settings.ItemControl>
    </Settings.Item>
  );
}

function ApplyProgress({ rules }: { rules: ReadonlyArray<RuleSummary> }) {
  const state = useApplyState();
  const watching = useRef(false);
  const nameOf = (ruleId: string) =>
    rules.find((entry) => entry.rule.id === ruleId)?.rule.name ?? "Rule";
  useEffect(() => {
    if (state.status === "running") {
      watching.current = true;
      return;
    }
    if (state.status !== "finished" || !watching.current) return;
    watching.current = false;
    const name =
      rules.find((entry) => entry.rule.id === state.ruleId)?.rule.name ??
      "Rule";
    notifyUndoable({
      id: `rules-apply-${state.ruleId}`,
      title: state.error
        ? `“${name}” stopped: ${state.error}`
        : `“${name}” organized ${formatPlural(state.changed, { one: "Save", other: "Saves" })}${state.cancelled ? " before you stopped it" : ""}`,
      undoneTitle: `Undid “${name}”`,
      subject: name,
      step: state.undoId,
    });
  }, [state, rules]);
  if (state.status !== "running") return null;
  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <span>
        Applying “{nameOf(state.ruleId)}” · {state.done} of {state.total}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void window.pond.query("rules.cancelApply", {})}
      >
        Stop
      </Button>
    </div>
  );
}

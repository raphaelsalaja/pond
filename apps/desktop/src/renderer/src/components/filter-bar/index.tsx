import {
  IconCheckOutline18,
  IconPlusOutline18,
  IconXmarkOutline18,
} from "@pond/icons/outline/18";
import { FIELD_META } from "@pond/schema/filters/meta";
import {
  COMPARATORS_BY_TYPE,
  type ComparatorId,
  EMPTY_QUERY,
  type Predicate,
  type Query,
} from "@pond/schema/filters/types";
import { readQuery, writeQuery } from "@pond/schema/filters/url";
import { Menu } from "@pond/ui";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type AddCommitApi,
  appendPredicate,
  predicateIsActive,
  replacePredicate,
  topLevelPredicates,
} from "./helpers";
import {
  AddFilterMenu,
  COMPARATOR_LABELS,
  dropdownFor,
  FIELD_ICONS,
} from "./registry";
import styles from "./styles.module.css";

function Root({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readQuery(params), [params]);
  const predicates = topLevelPredicates(query).map((p, idx) => ({ p, idx }));
  const active = predicates.filter(({ p }) => predicateIsActive(p));
  if (active.length === 0) return null;

  function commit(next: Query) {
    setParams(writeQuery(params, next), { replace: true });
  }

  function clearAll() {
    commit(EMPTY_QUERY);
  }

  const addApi: AddCommitApi = {
    commitOne: (predicate) => commit(appendPredicate(query, predicate)),
    liveAdd: (predicate) => {
      commit(appendPredicate(query, predicate));
      return query.clauses.length;
    },
    liveUpdate: (idx, predicate) => {
      commit(replacePredicate(query, idx, predicate));
    },
  };

  return (
    <Bar className={className} {...props}>
      {active.map(({ p, idx }) => (
        <Chip
          key={`${p.field}-${idx}`}
          predicate={p}
          onChange={(next) => commit(replacePredicate(query, idx, next))}
        />
      ))}
      <AddTrigger api={addApi} />
      <ClearAll onClick={clearAll} />
    </Bar>
  );
}

interface BarProps extends React.ComponentPropsWithoutRef<"div"> {}

function Bar({ className, ...props }: BarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Active filters"
      className={[styles.bar, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}

interface ChipProps {
  predicate: Predicate;
  onChange: (next: Predicate | null) => void;
}

function Chip({ predicate, onChange }: ChipProps) {
  const meta = FIELD_META[predicate.field];
  const Icon = FIELD_ICONS[predicate.field];
  const Dropdown = dropdownFor(predicate.field);
  const allowed = COMPARATORS_BY_TYPE[meta.type];

  const preview = describePredicate(predicate);

  return (
    <span className={styles.chip} data-filter-id={predicate.field}>
      <button
        type="button"
        className={[styles["chip-segment"], styles["chip-dimension"]].join(" ")}
        aria-label={meta.label}
      >
        <span className={styles["chip-icon"]} aria-hidden>
          <Icon width="1em" height="1em" />
        </span>
        {meta.label}
      </button>

      <ComparatorSegment
        cmp={predicate.cmp}
        negate={Boolean(predicate.negate)}
        allowed={allowed}
        onChange={(nextCmp, nextNegate) =>
          onChange({
            ...predicate,
            cmp: nextCmp,
            ...(nextNegate ? { negate: true } : { negate: undefined }),
          })
        }
      />

      <ValueSegment label={meta.label} preview={preview}>
        <Dropdown predicate={predicate} onChange={onChange} />
      </ValueSegment>

      <button
        type="button"
        aria-label={`Remove ${meta.label} filter`}
        className={[styles["chip-segment"], styles["chip-close"]].join(" ")}
        onClick={() => onChange(null)}
      >
        <IconXmarkOutline18 width="0.7em" height="0.7em" />
      </button>
    </span>
  );
}

interface ComparatorSegmentProps {
  cmp: ComparatorId;
  negate: boolean;
  allowed: readonly ComparatorId[];
  onChange: (cmp: ComparatorId, negate: boolean) => void;
}

function ComparatorSegment({
  cmp,
  negate,
  allowed,
  onChange,
}: ComparatorSegmentProps) {
  const label = negate
    ? `not ${COMPARATOR_LABELS[cmp]}`
    : COMPARATOR_LABELS[cmp];
  return (
    <Menu.Root>
      <Menu.Trigger
        className={[styles["chip-segment"], styles["chip-operator"]].join(" ")}
        aria-label="Comparator"
      >
        {label}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" side="bottom" sideOffset={6}>
          <Menu.Popup className={styles["operator-popup"]}>
            <Menu.RadioGroup
              value={cmp}
              onValueChange={(next) => onChange(next as ComparatorId, false)}
            >
              {allowed.map((id) => (
                <Menu.RadioItem key={id} value={id}>
                  <Menu.RadioItemIndicator>
                    <IconCheckOutline18 width="0.85em" height="0.85em" />
                  </Menu.RadioItemIndicator>
                  {COMPARATOR_LABELS[id]}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator />
            <Menu.CheckboxItem
              checked={negate}
              onCheckedChange={(checked) => onChange(cmp, Boolean(checked))}
            >
              <Menu.ItemLabel>Invert</Menu.ItemLabel>
            </Menu.CheckboxItem>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface ValueSegmentProps {
  label: string;
  preview: string;
  children: React.ReactNode;
}

function ValueSegment({ label, preview, children }: ValueSegmentProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className={[styles["chip-segment"], styles["chip-value"]].join(" ")}
        aria-label={`${label} value`}
      >
        {preview || "any"}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" side="bottom" sideOffset={6}>
          <Menu.Popup className={styles["value-popup"]}>{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface AddTriggerProps extends React.ComponentPropsWithoutRef<"button"> {
  api: AddCommitApi;
}

function AddTrigger({ api, className, ...props }: AddTriggerProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <button
            type="button"
            className={[
              styles["add-filter"],
              styles["add-filter-icon-only"],
              className ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label="Add filter"
            {...props}
          >
            <span className={styles["chip-icon"]} aria-hidden>
              <IconPlusOutline18 width="0.85em" height="0.85em" />
            </span>
          </button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6}>
          <Menu.Popup>
            <AddFilterMenu api={api} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

interface ClearAllProps extends React.ComponentPropsWithoutRef<"button"> {}

function ClearAll({ className, type = "button", ...props }: ClearAllProps) {
  return (
    <button
      type={type}
      className={[styles["clear-all"], className ?? ""]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      Clear
    </button>
  );
}

export const FilterBar = {
  Root,
  Bar,
  Chip,
  AddTrigger,
  ClearAll,
};

export function useActiveFilterCount(): number {
  const [params] = useSearchParams();
  return useMemo(() => {
    const query = readQuery(params);
    return topLevelPredicates(query).filter(predicateIsActive).length;
  }, [params]);
}

function describePredicate(p: Predicate): string {
  const v = p.value;
  if (p.cmp === "exists") return v === false ? "not set" : "set";
  if (Array.isArray(v)) {
    if (p.cmp === "between") {
      const [lo, hi] = v;
      return `${lo}–${hi}`;
    }
    if (v.length === 0) return "any";
    if (v.length === 1) return String(v[0]);
    return `${v.length} values`;
  }
  if (typeof v === "string") return v || "any";
  if (typeof v === "number") return String(v);
  return "any";
}

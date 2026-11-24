import { FIELD_META } from "@pond/schema/filters/meta";
import { isPredicateList } from "@pond/schema/filters/types";
import type {
  FieldId,
  Predicate,
  PredicateValue,
} from "@pond/schema/filters/types";
import { Input } from "@pond/ui";
import { useId, useState } from "react";
import { z } from "zod";
import { stopMenuKeys } from "../menu-keys";
import { FilterSelect } from "../select";
import { useFilterDraft } from "../use-filter-draft";
import styles from "./styles.module.css";

export type RangeUnit =
  | "seconds"
  | "minutes"
  | "hours"
  | "bytes"
  | "kilobytes"
  | "megabytes"
  | "gigabytes";

const UNIT_FACTORS = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  bytes: 1,
  kilobytes: 1024,
  megabytes: 1024 ** 2,
  gigabytes: 1024 ** 3,
} satisfies Record<RangeUnit, number>;

function unitItems(field: FieldId): Array<{ value: RangeUnit; label: string }> {
  if (field === "duration") {
    return [
      { value: "seconds", label: "Seconds" },
      { value: "minutes", label: "Minutes" },
      { value: "hours", label: "Hours" },
    ];
  }
  if (field === "fileSize") {
    return [
      { value: "bytes", label: "Bytes" },
      { value: "kilobytes", label: "KB" },
      { value: "megabytes", label: "MB" },
      { value: "gigabytes", label: "GB" },
    ];
  }
  return [];
}

function localDate(value: PredicateValue | undefined): string {
  const parsed = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .safeParse(value);
  if (!parsed.success) {
    return "";
  }
  const date = new Date(parsed.data);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function rangeBounds(
  predicate?: Predicate,
): [PredicateValue | undefined, PredicateValue | undefined] {
  if (!predicate) {
    return ["", ""];
  }
  if (predicate.operator === "between" && isPredicateList(predicate.value)) {
    return [predicate.value[0], predicate.value[1]];
  }
  if (predicate.operator === "eq") {
    return [predicate.value, predicate.value];
  }
  if (["gte", "gt"].includes(predicate.operator)) {
    return [predicate.value, ""];
  }
  if (["lte", "lt"].includes(predicate.operator)) {
    return ["", predicate.value];
  }
  return ["", ""];
}

export function rangePredicate(
  field: FieldId,
  start: string,
  end: string,
  multiplier = 1,
): Predicate | null {
  if (!start && !end) {
    return null;
  }
  const date = FIELD_META[field].type === "date";
  const bound = (text: string, last: boolean): number => {
    if (!date) {
      return Number(text) * multiplier;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return Number.NaN;
    }
    const value = new Date(`${text}T00:00:00`);
    if (!Number.isFinite(value.getTime())) {
      return Number.NaN;
    }
    if (localDate(value.toISOString()) !== text) {
      return Number.NaN;
    }
    if (last) {
      value.setDate(value.getDate() + 1);
      value.setMilliseconds(-1);
    }
    return value.getTime();
  };
  const lo = start ? bound(start, false) : null;
  const hi = end ? bound(end, true) : null;
  if (
    [lo, hi].some(
      (value) =>
        value !== null &&
        (!Number.isFinite(value) ||
          (!date &&
            (value < 0 ||
              (field === "fileCount" && !Number.isInteger(value))))),
    )
  ) {
    return null;
  }
  if (lo !== null && hi !== null && lo > hi) {
    return null;
  }
  const value = (n: number) => (date ? new Date(n).toISOString() : n);
  if (lo !== null && hi !== null) {
    return {
      field,
      operator: !date && lo === hi ? "eq" : "between",
      value: !date && lo === hi ? lo : [value(lo), value(hi)],
    };
  }
  return lo !== null
    ? { field, operator: "gte", value: value(lo) }
    : hi !== null
      ? { field, operator: "lte", value: value(hi) }
      : null;
}

export function CustomFilter({
  field,
  current,
  initialUnit,
  onUnitChange,
  onApply,
  onClear,
}: {
  field: FieldId;
  current?: Predicate;
  initialUnit?: RangeUnit;
  onUnitChange?: (unit: RangeUnit) => void;
  onApply: (predicate: Predicate) => void;
  onClear?: () => void;
}) {
  const date = FIELD_META[field].type === "date";
  const startingUnit =
    initialUnit ?? (field === "fileSize" ? "kilobytes" : "seconds");
  const units = unitItems(field);
  const [lo, hi] = rangeBounds(current);
  const startId = useId();
  const endId = useId();
  const initialValue = (value: PredicateValue | undefined) =>
    date
      ? localDate(value)
      : value === ""
        ? ""
        : String(Number(value) / UNIT_FACTORS[startingUnit]);
  const [start, setStart] = useState(initialValue(lo));
  const [end, setEnd] = useState(initialValue(hi));
  const [unit, setUnit] = useState<RangeUnit>(startingUnit);
  const factor = UNIT_FACTORS[unit];
  const draft = rangePredicate(field, start, end, factor);
  const sameBound = (text: string, value: PredicateValue | undefined) => {
    if (date) {
      return text === localDate(value);
    }
    if (text === "" || value === "") {
      return text === value;
    }
    return (
      Math.abs(Number(text) * factor - Number(value)) <=
      Math.max(1, Math.abs(Number(value))) * 1e-10
    );
  };
  const unchanged = !!current && sameBound(start, lo) && sameBound(end, hi);
  const predicate = draft && unchanged ? current : draft;
  const schedule = useFilterDraft();
  const edit = (nextStart: string, nextEnd: string) => {
    setStart(nextStart);
    setEnd(nextEnd);
    const next = rangePredicate(field, nextStart, nextEnd, factor);
    schedule(
      next ? () => onApply(next) : !nextStart && !nextEnd ? onClear : undefined,
    );
  };
  return (
    <form
      className={styles.form}
      onKeyDown={stopMenuKeys}
      onSubmit={(event) => {
        event.preventDefault();
        schedule();
        if (predicate) {
          onApply(predicate);
        } else if (!start && !end) {
          onClear?.();
        }
      }}
    >
      {date ? (
        <div className={styles.row} data-date>
          <label className={styles.field} htmlFor={startId}>
            From
            <Input.Root size="sm">
              <Input.Field
                id={startId}
                type="date"
                value={start}
                onValueChange={(value) => edit(value, end)}
              />
            </Input.Root>
          </label>
          <label className={styles.field} htmlFor={endId}>
            To
            <Input.Root size="sm">
              <Input.Field
                id={endId}
                type="date"
                value={end}
                onValueChange={(value) => edit(start, value)}
              />
            </Input.Root>
          </label>
        </div>
      ) : (
        <div className={styles.row}>
          <Input.Root size="sm">
            <Input.Field
              id={startId}
              type="number"
              min={0}
              step={field === "fileCount" ? 1 : "any"}
              value={start}
              onValueChange={(value) => edit(value, end)}
              placeholder="Min"
              aria-label={
                unchanged && current?.operator === "gt"
                  ? "More Than"
                  : "Minimum"
              }
            />
          </Input.Root>
          <span className={styles.separator} aria-hidden>
            –
          </span>
          <Input.Root size="sm">
            <Input.Field
              id={endId}
              type="number"
              min={0}
              step={field === "fileCount" ? 1 : "any"}
              value={end}
              onValueChange={(value) => edit(start, value)}
              placeholder="Max"
              aria-label={
                unchanged && current?.operator === "lt"
                  ? "Less Than"
                  : "Maximum"
              }
            />
          </Input.Root>
          {units.length ? (
            <FilterSelect
              className={styles.unit}
              label={field === "duration" ? "Duration Unit" : "Size Unit"}
              value={unit}
              items={units}
              onChange={(next) => {
                const nextFactor = UNIT_FACTORS[next];
                const convert = (value: string) =>
                  value
                    ? String(
                        Number(
                          ((Number(value) * factor) / nextFactor).toPrecision(
                            12,
                          ),
                        ),
                      )
                    : "";
                setStart(convert(start));
                setEnd(convert(end));
                setUnit(next);
                onUnitChange?.(next);
              }}
            />
          ) : null}
        </div>
      )}
      {(start || end) && !predicate ? (
        <p className={styles.error} role="status">
          Enter a valid range with the minimum first.
        </p>
      ) : null}
    </form>
  );
}

import type { Predicate, PredicateValue } from "@pond/schema/filters/types";
import { Input } from "@pond/ui";
import { useState } from "react";
import { stopMenuKeys } from "../menu-keys";
import { useFilterDraft } from "../use-filter-draft";
import { rangeBounds, rangePredicate } from "./";
import styles from "./styles.module.css";

function numberText(value: PredicateValue | undefined): string {
  return value === "" ? "" : String(value);
}

function currentPredicate(
  field: "width" | "height",
  start: string,
  end: string,
  current?: Predicate,
): Predicate | null {
  const draft = rangePredicate(field, start, end);
  const [lo, hi] = rangeBounds(current);
  return numberText(lo) === start && numberText(hi) === end && current
    ? current
    : draft;
}

function dimensionRow(
  label: string,
  minimum: string,
  maximum: string,
  setMinimum: (value: string) => void,
  setMaximum: (value: string) => void,
) {
  return (
    <div className={styles.dimension}>
      <span className={styles.label}>{label}</span>
      <Input.Root size="sm">
        <Input.Field
          type="number"
          min={0}
          step={1}
          value={minimum}
          onValueChange={setMinimum}
          placeholder="Min"
          aria-label={`${label === "W" ? "Width" : "Height"} Minimum`}
        />
      </Input.Root>
      <span className={styles.separator} aria-hidden>
        –
      </span>
      <Input.Root size="sm">
        <Input.Field
          type="number"
          min={0}
          step={1}
          value={maximum}
          onValueChange={setMaximum}
          placeholder="Max"
          aria-label={`${label === "W" ? "Width" : "Height"} Maximum`}
        />
      </Input.Root>
      <span className={styles.suffix}>px</span>
    </div>
  );
}

export function DimensionsFilter({
  rows,
  onChange,
}: {
  rows: Array<Predicate>;
  onChange: (rows: Array<Predicate>) => void;
}) {
  const width = rows.find((row) => row.field === "width");
  const height = rows.find((row) => row.field === "height");
  const [widthLoValue, widthHiValue] = rangeBounds(width);
  const [heightLoValue, heightHiValue] = rangeBounds(height);
  const widthLo = numberText(widthLoValue);
  const widthHi = numberText(widthHiValue);
  const heightLo = numberText(heightLoValue);
  const heightHi = numberText(heightHiValue);
  const [minimumWidth, setMinimumWidth] = useState(widthLo);
  const [maximumWidth, setMaximumWidth] = useState(widthHi);
  const [minimumHeight, setMinimumHeight] = useState(heightLo);
  const [maximumHeight, setMaximumHeight] = useState(heightHi);
  const nextWidth = currentPredicate(
    "width",
    minimumWidth,
    maximumWidth,
    width,
  );
  const nextHeight = currentPredicate(
    "height",
    minimumHeight,
    maximumHeight,
    height,
  );
  const widthDrafted = Boolean(minimumWidth || maximumWidth);
  const heightDrafted = Boolean(minimumHeight || maximumHeight);
  const valid =
    (widthDrafted || heightDrafted) &&
    (!widthDrafted || nextWidth) &&
    (!heightDrafted || nextHeight);

  const schedule = useFilterDraft();
  const edit = (wlo: string, whi: string, hlo: string, hhi: string) => {
    setMinimumWidth(wlo);
    setMaximumWidth(whi);
    setMinimumHeight(hlo);
    setMaximumHeight(hhi);
    const w = currentPredicate("width", wlo, whi, width);
    const h = currentPredicate("height", hlo, hhi, height);
    schedule(
      ((wlo || whi) && !w) || ((hlo || hhi) && !h)
        ? undefined
        : () =>
            onChange([
              ...rows.filter(
                (row) => row.field !== "width" && row.field !== "height",
              ),
              ...(w ? [w] : []),
              ...(h ? [h] : []),
            ]),
    );
  };

  return (
    <form
      className={styles.form}
      onKeyDown={stopMenuKeys}
      onSubmit={(event) => {
        event.preventDefault();
        schedule();
        if (!valid) return;
        onChange([
          ...rows.filter(
            (row) => row.field !== "width" && row.field !== "height",
          ),
          ...(nextWidth ? [nextWidth] : []),
          ...(nextHeight ? [nextHeight] : []),
        ]);
      }}
    >
      {dimensionRow(
        "W",
        minimumWidth,
        maximumWidth,
        (v) => edit(v, maximumWidth, minimumHeight, maximumHeight),
        (v) => edit(minimumWidth, v, minimumHeight, maximumHeight),
      )}
      {dimensionRow(
        "H",
        minimumHeight,
        maximumHeight,
        (v) => edit(minimumWidth, maximumWidth, v, maximumHeight),
        (v) => edit(minimumWidth, maximumWidth, minimumHeight, v),
      )}
      {!valid && (widthDrafted || heightDrafted) ? (
        <p className={styles.error} role="status">
          Enter a valid range with the minimum first.
        </p>
      ) : null}
    </form>
  );
}

import { IconAscendingSorting, IconDescendingSorting } from "@pond/icons";
import { Button, Switch, Toggle, ToggleGroup } from "@pond/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { LIBRARY_SAVE_RADIUS_MAX } from "@/features/library/components/layouts/save-radius";
import { Fields } from "../fields";
import {
  DETAILS,
  FITS,
  GAP_MAX,
  INFO_FIELDS,
  LAYOUTS,
  PRESETS,
  QUALITIES,
  SIZE_MAX,
  SIZE_MIN,
  SORTS,
} from "../options";
import { useViewOptions } from "../use-view-options";
import styles from "./styles.module.css";

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset aria-label={label} className={styles.section}>
      {children}
    </fieldset>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.controls}>{children}</div>
    </div>
  );
}

function Control({ children }: { children: ReactNode }) {
  return <div className={styles.control}>{children}</div>;
}

function Layouts() {
  const view = useViewOptions();
  return (
    <ToggleGroup
      variant="pills"
      aria-label="Layout"
      className={styles.layouts}
      value={[view.layout]}
      onValueChange={([next]) => {
        const match = LAYOUTS.find((option) => option.value === next);
        if (match) {
          view.setLayout(match.value);
        }
      }}
    >
      {LAYOUTS.map((option) => (
        <Toggle key={option.value} type="button" value={option.value}>
          {option.icon}
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

function Presets() {
  const view = useViewOptions();
  const title = useId();
  return (
    <Section label="Presets">
      <h3 id={title} className={styles.title}>
        Presets
      </h3>
      <ToggleGroup
        variant="pills"
        aria-labelledby={title}
        className={styles.presets}
        value={view.preset ? [view.preset] : []}
        onValueChange={([next]) => {
          const match = PRESETS.find((preset) => preset.value === next);
          if (match) {
            view.applyPreset(match);
          }
        }}
      >
        {PRESETS.map((preset) => (
          <Toggle key={preset.value} type="button" value={preset.value}>
            {preset.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Section>
  );
}

function SortBy() {
  const view = useViewOptions();
  const ascending = view.sortDir === "asc";
  return (
    <Row label="Sort By">
      <Button
        icon
        size="xs"
        variant="ghost"
        aria-label="Toggle Sort Direction"
        onClick={() => view.setSortDir(ascending ? "desc" : "asc")}
      >
        {ascending ? <IconAscendingSorting /> : <IconDescendingSorting />}
      </Button>
      <Control>
        <Fields.Select
          label="Sort By"
          items={SORTS}
          value={view.sortKey}
          onValueChange={view.setSortKey}
        />
      </Control>
    </Row>
  );
}

function CardOptions() {
  const view = useViewOptions();
  return (
    <Section label="Card Options">
      <h3 className={styles.title}>Card Options</h3>
      <Row label="Shown Information">
        <Control>
          <Fields.Select
            label="Shown Information"
            items={INFO_FIELDS}
            value={view.infoField}
            disabled={!view.details.info}
            onValueChange={view.setInfoField}
          />
        </Control>
      </Row>
      <Row label="Corner Radius">
        <Control>
          <Fields.Measure
            label="Corner Radius"
            value={view.rounding}
            min={0}
            max={LIBRARY_SAVE_RADIUS_MAX}
            onValueChange={view.setRounding}
          />
        </Control>
      </Row>
      <Row label="Thumbnail Fit">
        <Control>
          <Fields.Select
            label="Thumbnail Fit"
            items={FITS}
            value={view.fit}
            onValueChange={view.setFit}
          />
        </Control>
      </Row>
      <Row label="Thumbnail Quality">
        <Control>
          <Fields.Select
            label="Thumbnail Quality"
            items={QUALITIES}
            value={view.quality}
            onValueChange={view.setQuality}
          />
        </Control>
      </Row>
    </Section>
  );
}

function DisplayProperties() {
  const view = useViewOptions();
  return (
    <Section label="Display Properties">
      <h3 className={styles.title}>Display Properties</h3>
      {DETAILS.map((detail) => (
        <Row key={detail.value} label={detail.label}>
          <Switch.Root
            aria-label={detail.label}
            checked={view.details[detail.value]}
            onCheckedChange={(on) => view.setDetail(detail.value, on)}
          />
        </Row>
      ))}
    </Section>
  );
}

export function ViewOptions() {
  const view = useViewOptions();
  const list = view.layout === "list";
  return (
    <div className={styles.panel}>
      <Section label="Layout">
        <Layouts />
      </Section>
      <Presets />
      <Section label="Sorting and Size">
        <SortBy />
        <Row label="Size">
          <Control>
            <Fields.Measure
              label="Size"
              value={view.size}
              min={SIZE_MIN}
              max={SIZE_MAX}
              disabled={list}
              onValueChange={view.setSize}
            />
          </Control>
        </Row>
        <Row label="Gap">
          <Control>
            <Fields.Measure
              label="Gap"
              value={view.gap}
              min={0}
              max={GAP_MAX}
              disabled={list}
              onValueChange={view.setGap}
            />
          </Control>
        </Row>
      </Section>
      <Section label="Folders">
        <h3 className={styles.title}>Folders</h3>
        <Row label="Show Subfolder Contents">
          <Switch.Root
            aria-label="Show Subfolder Contents"
            checked={view.subfolders}
            onCheckedChange={view.setSubfolders}
          />
        </Row>
      </Section>
      <CardOptions />
      <DisplayProperties />
    </div>
  );
}

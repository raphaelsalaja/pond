import { Button } from "@pond/ui";
import type { ReactNode } from "react";
import { useSaveDetail } from "@/features/saves/hooks/use-save-detail";
import {
  deriveTypeLabel,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import type { Save } from "@/features/saves/types";
import { PropertyList } from "@/shared/components/property-list";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { formatBytes } from "@/shared/lib/format";
import { copyFact, type FactAction, factFilters, factMenu } from "./actions";

export { ratingMenu } from "./actions";

import styles from "./styles.module.css";

const FACT_IDS = [
  "type",
  "duration",
  "dimensions",
  "size",
  "container",
  "videoCodec",
  "audioCodec",
  "bitrate",
  "colorSpace",
  "imported",
  "taken",
  "published",
  "modified",
  "id",
] as const;

const DATE_IDS = new Set(["imported", "taken", "published", "modified"]);

interface Fact {
  id: string;
  label: string;
  value: string;
  mono?: boolean;
}

export function SaveFacts({ save }: { save: Save }) {
  const { rows } = useSaveDetail(save.id);
  const byId = new Map<string, Fact>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        label: row.label,
        value: row.value,
        mono: row.kind === "mono",
      },
    ]),
  );
  byId.set("type", {
    id: "type",
    label: "Type",
    value: deriveTypeLabel(pickPrimaryFile(save), save) ?? "File",
  });
  const size =
    save.fileSize ?? save.files.reduce((sum, file) => sum + file.size, 0);
  if (size)
    byId.set("size", { id: "size", label: "Size", value: formatBytes(size) });
  const imported = byId.get("imported");
  if (imported) byId.set("imported", { ...imported, label: "Saved" });
  const facts = FACT_IDS.flatMap((id) => {
    const fact = byId.get(id);
    return fact?.value ? [fact] : [];
  });

  return facts.map((fact) => {
    const display = DATE_IDS.has(fact.id)
      ? (fact.value.split(" · ").at(-1) ?? fact.value)
      : fact.value;
    return (
      <FactTile
        key={fact.id}
        label={fact.label}
        value={fact.value}
        filters={factFilters({ ...fact, display }, save)}
        span={fact.id === "id" ? "full" : undefined}
      >
        <PropertyList.Value
          title={fact.value}
          className={fact.mono ? styles.mono : undefined}
        >
          {display}
        </PropertyList.Value>
      </FactTile>
    );
  });
}

function FactTile({
  label,
  value,
  filters,
  span,
  children,
}: {
  label: string;
  value: string;
  filters: readonly FactAction[];
  span?: "full";
  children: ReactNode;
}) {
  const primary = filters[0] ?? {
    label: `Copy ${label}`,
    run: () => copyFact(label, value),
  };
  return (
    <SpecContextMenu buildItems={() => factMenu(label, value, filters)}>
      <Button
        variant="bare"
        rounding="rounded"
        nativeButton={false}
        title={primary.label}
        onClick={primary.run}
        render={<PropertyList.Row span={span} data-interactive="" />}
      >
        <PropertyList.Label>{label}</PropertyList.Label>
        {children}
      </Button>
    </SpecContextMenu>
  );
}

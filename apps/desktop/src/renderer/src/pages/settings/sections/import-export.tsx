import { Link } from "react-router-dom";
import { SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Import & export. Export is real and lives in Storage (zip + JSON
 * exports). Import is intentionally out of scope for this milestone
 * — listing the planned sources here so the chrome reads as
 * complete instead of a 404.
 */
export function ImportExportSection() {
  return (
    <SectionStack>
      <SectionHeader
        title="Import & export"
        description="Take your library out as a zip or per-save JSON. Imports are not part of this milestone."
      />

      <SettingsCard title="Export">
        <p style={{ margin: 0, fontSize: 13, color: "var(--pond-fg-soft)" }}>
          Library zip and metadata JSON exports are available on the{" "}
          <Link
            to="/settings/storage"
            style={{ color: "var(--pond-fg)", textDecoration: "underline" }}
          >
            Storage
          </Link>{" "}
          page.
        </p>
      </SettingsCard>

      <SettingsCard title="Import">
        <p style={{ margin: 0, fontSize: 13, color: "var(--pond-fg-soft)" }}>
          Pond's first milestone focuses on capture + curation of new saves, so
          importers from Pinterest, Eagle, Pocket, Raindrop, and friends are not
          built yet. The export format is stable so you can round-trip in/out of
          Pond once the importer suite lands.
        </p>
      </SettingsCard>
    </SectionStack>
  );
}

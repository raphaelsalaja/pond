import { usePrefs } from "../../../pool/prefs";
import { Input } from "../../../ui";
import {
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";

/**
 * Library identity. Just a friendly display name — used in the
 * window title bar, the Backups snapshot filenames, and the
 * exported manifest. The on-disk folder name is independent and
 * managed via Storage → "Move library…".
 */
export function LibrarySection() {
  const [prefs, patch] = usePrefs("library");
  return (
    <SectionStack>
      <SectionHeader
        title="Library identity"
        description="How this library shows up in window titles and exports."
      />

      <SettingsCard title="Identity">
        <StackedRow
          label="Display name"
          description="Cosmetic label shown in chrome and bundled into export manifests. Doesn't rename the on-disk folder."
        >
          <Input
            size="sm"
            placeholder="My Pond"
            value={prefs.displayName}
            onChange={(e) => patch({ displayName: e.target.value })}
          />
        </StackedRow>
      </SettingsCard>
    </SectionStack>
  );
}

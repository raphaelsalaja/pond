import { usePrefs } from "../../../pool/prefs";
import { Input, Switch } from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Search ranking knobs. Read by `saves.search` in
 * `apps/desktop/src/main/ipc/index.ts`. `hybrid` blends FTS with
 * vector scoring; `recencyBoost` nudges newer saves higher;
 * `resultLimit` caps the FTS5 prefix-match query.
 */
export function SearchSection() {
  const [prefs, patch] = usePrefs("search");
  return (
    <SectionStack>
      <SectionHeader
        title="Search"
        description="Tune how the global search combines lexical and vector results."
      />

      <SettingsCard title="Ranking">
        <Row
          label="Hybrid search"
          description="Blend SQLite FTS results with vector embeddings for better recall."
          control={
            <Switch
              checked={prefs.hybrid}
              onCheckedChange={(v) => patch({ hybrid: v })}
            />
          }
        />
        <Row
          label="Recency boost"
          description="Slight bias toward newer saves when ranks are otherwise tied."
          control={
            <Switch
              checked={prefs.recencyBoost}
              onCheckedChange={(v) => patch({ recencyBoost: v })}
            />
          }
        />
        <Row
          label="Result limit"
          description="Maximum number of rows returned per search. Lower is snappier on huge libraries."
          control={
            <Input
              size="sm"
              type="number"
              value={String(prefs.resultLimit)}
              onChange={(e) =>
                patch({
                  resultLimit: Math.max(
                    10,
                    Math.min(2000, Number(e.target.value) || 200),
                  ),
                })
              }
              style={{ width: 96 }}
            />
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}

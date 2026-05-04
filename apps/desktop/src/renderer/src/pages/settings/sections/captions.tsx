import { usePrefs } from "../../../pool/prefs";
import { Input, Switch } from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Captions section. The vision enrichment job in
 * `apps/desktop/src/main/core/enrich/jobs/vision.ts` honours
 * `prefs.captions.autoAltText`; when off, the alt-text portion of
 * the prompt is skipped (the cheaper tagging path still runs).
 *
 * Video transcripts is a placeholder for the future whisper.cpp
 * pipeline — exposing the toggle now so the UI is complete and
 * wiring it once the worker lands.
 */
export function CaptionsSection() {
  const [prefs, patch] = usePrefs("captions");
  return (
    <SectionStack>
      <SectionHeader
        title="Captions"
        description="Auto-generate alt text and transcripts for media saves."
      />

      <SettingsCard title="Auto-captioning">
        <Row
          label="Image alt text"
          description="Generate alt text for image saves on first import. Honoured by the vision enrichment job."
          control={
            <Switch
              checked={prefs.autoAltText}
              onCheckedChange={(v) => patch({ autoAltText: v })}
            />
          }
        />
        <Row
          label="Video transcripts"
          description="Transcribe downloaded videos so they're searchable. Requires the whisper worker (lands in a follow-up)."
          control={
            <Switch
              checked={prefs.videoTranscripts}
              onCheckedChange={(v) => patch({ videoTranscripts: v })}
            />
          }
        />
        <Row
          label="Language"
          description="BCP-47 hint passed to vision/transcription jobs. Leave as `en` if your saves are mostly English."
          control={
            <Input
              size="sm"
              value={prefs.language}
              onChange={(e) => patch({ language: e.target.value })}
              style={{ width: 96 }}
            />
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}

import { Button, useToast } from "../../../ui";
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";

const RAYCAST_SNIPPET = String.raw`#!/usr/bin/env osascript
# @raycast.title Save to Pond
# @raycast.argument1 { "type": "text", "placeholder": "URL" }
on run argv
  open location ("pond://capture?url=" & item 1 of argv)
end run`;

/**
 * URL scheme & Shortcuts. Documents the deep-link surface — pond://
 * is registered as a default protocol client in main, so links from
 * Raycast / Shortcuts / Slack pop the app and route through the
 * relevant handler.
 *
 * Real-but-thin: the sub-paths (`item`, `search`, `capture`) are
 * documented here verbatim so the user can paste-into-Raycast right
 * away. The renderer's existing protocol handler already accepts the
 * `<id>/<file>` form for resource resolution.
 */
export function IntegrationsSection() {
  const toast = useToast();

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.add({ title: `${label} copied`, type: "success" });
  }

  return (
    <SectionStack>
      <SectionHeader
        title="URL scheme & Shortcuts"
        description="Pond registers the `pond://` URL scheme so other tools can deep-link into the app."
      />

      <SettingsCard title="Available URLs">
        <Row
          label={<code>pond://item/&lt;id&gt;</code>}
          description="Open the matching save in the library window."
          control={
            <Button
              size="sm"
              onClick={() => copy("pond://item/<id>", "Item URL")}
            >
              Copy
            </Button>
          }
        />
        <Row
          label={<code>pond://search?q=…</code>}
          description="Open the library focused on the search bar with the query pre-filled."
          control={
            <Button
              size="sm"
              onClick={() => copy("pond://search?q=design", "Search URL")}
            >
              Copy
            </Button>
          }
        />
        <Row
          label={<code>pond://capture?url=…</code>}
          description="Pop the quick-capture sheet pre-loaded with the URL."
          control={
            <Button
              size="sm"
              onClick={() =>
                copy("pond://capture?url=https://example.com", "Capture URL")
              }
            >
              Copy
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title="Raycast">
        <StackedRow
          label="Save-to-Pond script"
          description="Paste into a new Raycast script command. Triggers the capture URL with the typed argument."
        >
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              fontSize: 11,
              lineHeight: 1.5,
              overflow: "auto",
              background: "var(--pond-bg-subtle)",
              border: "1px solid var(--pond-border)",
              color: "var(--pond-fg)",
            }}
          >
            {RAYCAST_SNIPPET}
          </pre>
          <Button size="sm" onClick={() => copy(RAYCAST_SNIPPET, "Snippet")}>
            Copy snippet
          </Button>
        </StackedRow>
      </SettingsCard>

      <SettingsCard title="Apple Shortcuts">
        <Row
          label="Add a Save to Pond shortcut"
          description="Create a shortcut with a single Open URL action set to pond://capture?url=Shortcut Input."
          control={
            <Button
              size="sm"
              onClick={() => copy("pond://capture?url=", "URL prefix")}
            >
              Copy URL prefix
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}

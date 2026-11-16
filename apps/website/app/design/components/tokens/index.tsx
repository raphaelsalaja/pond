"use client";

import { Code } from "../code";
import { Doc } from "../doc";
import { Durations } from "../durations";
import { Focus } from "../focus";
import { Heights } from "../heights";
import { Palette } from "../palette";
import { Radii } from "../radii";
import { Roles } from "../roles";
import { Shadows } from "../shadows";
import { Spacing } from "../spacing";
import { Typography } from "../typography";

const HUE_ROLES = ["", "-hover", "-foreground", "-tint", "-border", "-contrast"];

const hue = (name: string) => HUE_ROLES.map((suffix) => `${name}${suffix}`);

const GROUPS = [
  {
    label: "Background",
    roles: [
      "background-primary",
      "background-secondary",
      "background-tertiary",
      "background-inverse",
    ],
  },
  {
    label: "Foreground",
    roles: [
      "foreground-primary",
      "foreground-secondary",
      "foreground-tertiary",
      "foreground-inverse",
    ],
  },
  {
    label: "Surface",
    roles: ["surface-primary", "surface-secondary", "surface-tertiary"],
  },
  { label: "Border", roles: ["border-subtle", "border-strong"] },
  { label: "Accent", roles: hue("accent") },
  { label: "Danger", roles: hue("danger") },
];

export function Tokens() {
  return (
    <Doc.Root>
      <Doc.Header>
        <Doc.Title>Tokens</Doc.Title>
        <Doc.Summary>
          Values from <Code.Inline>@pond/theme</Code.Inline>, read live from the
          current theme.
        </Doc.Summary>
      </Doc.Header>

      <Doc.Section id="color">
        <Doc.Heading>Color</Doc.Heading>
        <Doc.Summary>
          Each ratio is WCAG contrast against{" "}
          <Code.Inline>--ds-background-primary</Code.Inline>. Translucent colors show a dash.
        </Doc.Summary>
        {GROUPS.map((group) => (
          <Roles key={group.label} label={group.label} roles={group.roles} />
        ))}
      </Doc.Section>

      <Doc.Section id="palette">
        <Doc.Heading>Palette</Doc.Heading>
        <Doc.Summary>
          Colors you pick for folders, canvas notes, logos and fish. Each also
          has <Code.Inline>-tint</Code.Inline>,{" "}
          <Code.Inline>-border</Code.Inline> and{" "}
          <Code.Inline>-contrast</Code.Inline>.
        </Doc.Summary>
        <Palette />
      </Doc.Section>

      <Doc.Section id="typography">
        <Doc.Heading>Typography</Doc.Heading>
        <Doc.Summary>
          Intern in six sizes, each paired with a line height. Most text is 12
          or 14, and hierarchy comes from weight and color before size.
        </Doc.Summary>
        <Typography />
      </Doc.Section>

      <Doc.Section id="spacing">
        <Doc.Heading>Spacing</Doc.Heading>
        <Doc.Summary>
          A 2px grid. Most gaps are 4, 6 or 8, and padding is 12 or 16.
        </Doc.Summary>
        <Spacing />
      </Doc.Section>

      <Doc.Section id="height">
        <Doc.Heading>Height</Doc.Heading>
        <Doc.Summary>
          Buttons, fields, selects and toggles share three heights, so a row of
          them lines up.
        </Doc.Summary>
        <Heights />
      </Doc.Section>

      <Doc.Section id="radius">
        <Doc.Heading>Radius</Doc.Heading>
        <Radii />
      </Doc.Section>

      <Doc.Section id="shadow">
        <Doc.Heading>Shadow</Doc.Heading>
        <Shadows />
      </Doc.Section>

      <Doc.Section id="focus">
        <Doc.Heading>Focus</Doc.Heading>
        <Doc.Summary>
          One ring for every control, and none on text fields.
        </Doc.Summary>
        <Focus />
      </Doc.Section>

      <Doc.Section id="motion">
        <Doc.Heading>Motion</Doc.Heading>
        <Doc.Summary>
          Each duration runs with its paired easing token.
        </Doc.Summary>
        <Durations />
      </Doc.Section>
    </Doc.Root>
  );
}

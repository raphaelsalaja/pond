import type { ReactNode } from "react";
import { Changelog } from ".";
import type { ComponentDocs } from "../shared/docs";

function Column({ children }: { children: ReactNode }) {
  return <div style={{ width: 480 }}>{children}</div>;
}

export const docs: ComponentDocs = {
  slug: "changelog",
  name: "Changelog",
  tier: "composite",
  summary:
    "Release notes for one or more versions, grouped into Important, New, Improved and Fixed.",
  parts: [
    { name: "Changelog.Root", description: "The column of entries." },
    { name: "Changelog.Entry", description: "One release, an `<article>`." },
    {
      name: "Changelog.Meta",
      description: "The row with the version and date.",
    },
    { name: "Changelog.Version", description: "The version number." },
    {
      name: "Changelog.Date",
      description: "The release date, a `<time>`. Pass `dateTime`.",
    },
    { name: "Changelog.Body", description: "The title, summary and sections." },
    { name: "Changelog.Title", description: "The release title, an `<h3>`." },
    { name: "Changelog.Summary", description: "One sentence under the title." },
    {
      name: "Changelog.Section",
      description:
        "One group of changes. `category` is important, new, improved or fixed.",
    },
    {
      name: "Changelog.Heading",
      description:
        "The section heading, an `<h4>` with the category icon and label unless you pass children.",
    },
    { name: "Changelog.List", description: "The list of changes." },
    { name: "Changelog.Item", description: "One change, in a sentence." },
  ],
  keyboard: [],
  accessibility: [
    "Static content with no interactive parts.",
    "Each entry is an `<article>` with an `<h3>` title and `<h4>` section headings, so headings outline the page.",
    "Category icons are hidden from screen readers. The heading text names the category.",
    "Pass `dateTime` to `Changelog.Date` so the date is machine readable.",
  ],
  examples: [
    {
      name: "Entry",
      render: () => (
        <Column>
          <Changelog.Root>
            <Changelog.Entry>
              <Changelog.Meta>
                <Changelog.Version>2.7.0</Changelog.Version>
                <Changelog.Date dateTime="2026-11-13">
                  Nov 13, 2026
                </Changelog.Date>
              </Changelog.Meta>
              <Changelog.Body>
                <Changelog.Title>
                  A lighter Library, Fetch All, and Linux on ARM
                </Changelog.Title>
                <Changelog.Summary>
                  Large libraries open faster and use less memory, and Pond runs
                  on 64-bit ARM Linux.
                </Changelog.Summary>
                <Changelog.Section category="new">
                  <Changelog.Heading />
                  <Changelog.List>
                    <Changelog.Item>
                      Click Fetch All in the Sources toolbar to check every
                      source for new saves.
                    </Changelog.Item>
                    <Changelog.Item>
                      Click a playing video to pause it, and click again to
                      resume.
                    </Changelog.Item>
                  </Changelog.List>
                </Changelog.Section>
                <Changelog.Section category="improved">
                  <Changelog.Heading />
                  <Changelog.List>
                    <Changelog.Item>
                      Grid cards load a generated thumbnail instead of the full
                      original.
                    </Changelog.Item>
                  </Changelog.List>
                </Changelog.Section>
                <Changelog.Section category="fixed">
                  <Changelog.Heading />
                  <Changelog.List>
                    <Changelog.Item>
                      YouTube downloads store one merged file.
                    </Changelog.Item>
                  </Changelog.List>
                </Changelog.Section>
              </Changelog.Body>
            </Changelog.Entry>
          </Changelog.Root>
        </Column>
      ),
    },
    {
      name: "Important",
      render: () => (
        <Column>
          <Changelog.Root>
            <Changelog.Entry>
              <Changelog.Body>
                <Changelog.Section category="important">
                  <Changelog.Heading />
                  <Changelog.List>
                    <Changelog.Item>
                      Linux downloads now name their architecture, like
                      Pond-2.7.0-arm64.deb.
                    </Changelog.Item>
                  </Changelog.List>
                </Changelog.Section>
              </Changelog.Body>
            </Changelog.Entry>
          </Changelog.Root>
        </Column>
      ),
    },
    {
      name: "Several Releases",
      render: () => (
        <Column>
          <Changelog.Root>
            <Changelog.Entry>
              <Changelog.Meta>
                <Changelog.Version>2.7.0</Changelog.Version>
                <Changelog.Date dateTime="2026-11-13">
                  Nov 13, 2026
                </Changelog.Date>
              </Changelog.Meta>
              <Changelog.Body>
                <Changelog.Title>
                  A lighter Library and Fetch All
                </Changelog.Title>
                <Changelog.Summary>
                  Large libraries open faster, and sources can fetch on demand
                  or at launch.
                </Changelog.Summary>
              </Changelog.Body>
            </Changelog.Entry>
            <Changelog.Entry>
              <Changelog.Meta>
                <Changelog.Version>2.6.0</Changelog.Version>
                <Changelog.Date dateTime="2026-11-11">
                  Nov 11, 2026
                </Changelog.Date>
              </Changelog.Meta>
              <Changelog.Body>
                <Changelog.Title>
                  Clearer downloads and a Canvas minimap
                </Changelog.Title>
                <Changelog.Summary>
                  Downloads explain what they&apos;re waiting for, and Canvas
                  boards get a minimap.
                </Changelog.Summary>
              </Changelog.Body>
            </Changelog.Entry>
          </Changelog.Root>
        </Column>
      ),
    },
  ],
};

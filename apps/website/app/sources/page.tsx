import type { Metadata } from "next";
import { CONTRIBUTING_URL, RESPONSIBLE_USE_URL } from "@/lib/links";
import { Cta } from "../components/cta";
import { DownloadCta } from "../components/download-cta";
import { Frame } from "../components/frame";
import { Heading } from "../components/heading";
import { ImportList } from "../components/import-list";
import { PageHeader } from "../components/page-header";
import { Showcase } from "../components/showcase";
import { SourceDirectory } from "../components/source-directory";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Sources",
  description:
    "Pond syncs your saves from 18 sources, including X, Instagram, Pinterest, Are.na, and Bluesky, and imports the archives you download from other apps.",
};

export default function SourcesPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Sources</PageHeader.Label>
        <PageHeader.Title>
          Eighteen sources, synced to one library.
        </PageHeader.Title>
        <PageHeader.Lede>
          Connect an account through the Pond browser extension. Pond syncs it
          in the background, through your own browser session on your own
          computer.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <DownloadCta size="md" />
          <Cta href={RESPONSIBLE_USE_URL} variant="soft" external>
            Responsible Use
          </Cta>
        </PageHeader.Actions>
      </PageHeader.Root>
      <Showcase.Root scene="sources" label="The Sources page in Pond" />
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Every source</Heading.Label>
          <Heading.Title>What syncs, and how you connect.</Heading.Title>
        </Heading.Root>
        <SourceDirectory />
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Imports</Heading.Label>
          <Heading.Title>Bring the archives you already have.</Heading.Title>
          <Heading.Lede>
            Pond reads the files you download from other apps and adds every
            item to your library. Nothing in the archive leaves your computer.
          </Heading.Lede>
        </Heading.Root>
        <ImportList />
      </Frame.Section>
      <Frame.Section tone="muted" className={styles.pace}>
        <Heading.Root>
          <Heading.Label>Pacing</Heading.Label>
          <Heading.Title>Careful with your accounts.</Heading.Title>
          <Heading.Lede>
            A rate governor paces every request, backs off when a platform asks
            it to, and stops a source when the platform shows a challenge. Turn
            off Use a Schedule in Settings to stop automatic syncing.
          </Heading.Lede>
        </Heading.Root>
        <div className={styles.actions}>
          <Cta href={RESPONSIBLE_USE_URL} variant="soft" external>
            Read Responsible Use
          </Cta>
          <Cta href={CONTRIBUTING_URL} variant="ghost" external>
            Add a Source
          </Cta>
        </div>
      </Frame.Section>
    </main>
  );
}

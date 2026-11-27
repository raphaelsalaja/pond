import {
  IconArchiveDownload,
  IconChevronRight,
  IconFolderImport,
  IconImage,
  IconShare,
} from "@pond/icons";
import {
  IconGoogleChrome,
  IconInstagram,
  IconPinterest,
  IconReddit,
  IconTikTok,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import type { ComponentType, ReactNode, SVGProps } from "react";
import type { Release } from "@/lib/release";
import { FEATURES, LINKS } from "../../content/home";
import type { FeatureIcon } from "../../content/home";
import { AppIcon } from "../app-icon";
import { Cta } from "../cta";
import { DownloadButton, ExtensionButton } from "../downloads";
import styles from "./styles.module.css";

type Mark = ComponentType<SVGProps<SVGSVGElement>>;

/** A row of Source marks, the way Shiori lines up the browsers its extension runs in. */
const SOURCES: Array<Mark> = [
  IconXTwitter,
  IconInstagram,
  IconPinterest,
  IconTikTok,
  IconYoutube,
  IconReddit,
];

function Marks({ marks }: { marks: Array<Mark> }) {
  return (
    <span className={styles.marks}>
      {marks.map((Brand) => (
        <Brand key={Brand.name} className={styles.mark} aria-hidden />
      ))}
    </span>
  );
}

const ICONS: Record<FeatureIcon, ReactNode> = {
  app: <AppIcon size={32} />,
  extension: <Marks marks={[IconGoogleChrome]} />,
  sources: <Marks marks={SOURCES} />,
  watch: <Marks marks={[IconPinterest, IconYoutube]} />,
  history: <IconArchiveDownload size={24} aria-hidden />,
  share: <IconShare size={24} aria-hidden />,
  files: <IconFolderImport size={24} aria-hidden />,
  originals: <IconImage size={24} aria-hidden />,
};

/** What saves into Pond, two to a row, each with its icon and, for the two installs, its buttons. */
export function Features({ release }: { release: Release | null }) {
  return (
    <ul className={styles.grid}>
      {FEATURES.map((feature) => (
        <li key={feature.title} className={styles.feature}>
          <span className={styles.icon}>{ICONS[feature.icon]}</span>
          <div className={styles.words}>
            <h3 className={styles.title}>{feature.title}</h3>
            <p className={styles.body}>{feature.body}</p>
          </div>
          {feature.action === "download" && (
            <span className={styles.actions}>
              <DownloadButton release={release} variant="outline" size="sm">
                Download
              </DownloadButton>
              <Cta href={LINKS.releases} variant="outline" size="sm">
                <IconChevronRight size={14} aria-label="Every release" />
              </Cta>
            </span>
          )}
          {feature.action === "extension" && (
            <span className={styles.actions}>
              <ExtensionButton variant="outline" size="sm">
                Install Extension
              </ExtensionButton>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

"use client";

import type { ReactNode } from "react";
import { useBrowser, usePlatform } from "@/lib/platform";
import { extensionUrl, otherDownloads, primaryDownload } from "@/lib/release";
import type { Release } from "@/lib/release";
import { Cta } from "../cta";
import type { CtaProps } from "../cta";
import styles from "./styles.module.css";

type ButtonProps = Omit<CtaProps, "href" | "children"> & {
  children?: ReactNode;
};

/** The build for the visitor's computer, labeled with its platform unless the caller names it. */
export function DownloadButton({
  release,
  children,
  ...props
}: ButtonProps & { release: Release | null }) {
  const primary = primaryDownload(usePlatform(), release);
  return (
    <Cta href={primary.href} {...props}>
      {children ?? primary.label}
    </Cta>
  );
}

/** The extension store for the visitor's browser. */
export function ExtensionButton({ children, ...props }: ButtonProps) {
  return (
    <Cta href={extensionUrl(useBrowser())} {...props}>
      {children ?? "Browser Extension"}
    </Cta>
  );
}

/** The visitor's download and the extension, with every other build as one quiet line. */
export function Downloads({ release }: { release: Release | null }) {
  const others = otherDownloads(usePlatform(), release).slice(0, 3);
  return (
    <div className={styles.root}>
      <div className={styles.buttons}>
        <DownloadButton release={release} size="sm" />
        <ExtensionButton variant="tertiary" size="sm" />
      </div>
      {others.length > 0 && (
        <p className={styles.others}>
          Also for{" "}
          {others.map((download, index) => (
            <span key={download.label}>
              <a className={styles.link} href={download.href}>
                {download.label}
              </a>
              {index < others.length - 1 ? ", " : ""}
            </span>
          ))}
          {release ? ` · ${release.tag}` : ""}
        </p>
      )}
    </div>
  );
}

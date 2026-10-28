import type { Metadata } from "next";
import Image from "next/image";
import { Cta } from "../components/cta";
import { Frame } from "../components/frame";
import { Heading } from "../components/heading";
import { PageHeader } from "../components/page-header";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Brand",
  description: "Download the Pond mark, wordmark, and app icon.",
};

interface Asset {
  title: string;
  body: string;
  preview: {
    src: string;
    width: number;
    height: number;
    tone: "light" | "dark";
  }[];
  downloads: { label: string; href: string }[];
}

const ASSETS: Asset[] = [
  {
    title: "Mark",
    body: "For avatars, favicons, and anywhere the name is already nearby.",
    preview: [
      { src: "/brand/pond-mark.svg", width: 72, height: 72, tone: "light" },
      {
        src: "/brand/pond-mark-white.svg",
        width: 72,
        height: 72,
        tone: "dark",
      },
    ],
    downloads: [
      { label: "Black SVG", href: "/brand/pond-mark.svg" },
      { label: "White SVG", href: "/brand/pond-mark-white.svg" },
    ],
  },
  {
    title: "Wordmark",
    body: "The mark and the name locked up together. Use it when Pond is introduced.",
    preview: [
      {
        src: "/brand/pond-wordmark.svg",
        width: 166,
        height: 50,
        tone: "light",
      },
      {
        src: "/brand/pond-wordmark-white.svg",
        width: 166,
        height: 50,
        tone: "dark",
      },
    ],
    downloads: [
      { label: "Black SVG", href: "/brand/pond-wordmark.svg" },
      { label: "White SVG", href: "/brand/pond-wordmark-white.svg" },
    ],
  },
  {
    title: "App Icon",
    body: "The icon from the Dock and the Start menu. Use it when you link to a download.",
    preview: [
      {
        src: "/brand/pond-icon-256.png",
        width: 112,
        height: 112,
        tone: "light",
      },
    ],
    downloads: [
      { label: "PNG, 1024 px", href: "/brand/pond-icon.png" },
      { label: "PNG, 256 px", href: "/brand/pond-icon-256.png" },
    ],
  },
];

const USAGE = [
  {
    title: "Keep the shapes",
    body: "Don't stretch, rotate, outline, or redraw the mark. Scale it evenly.",
  },
  {
    title: "Black or white",
    body: "Use the black files on light backgrounds and the white files on dark ones.",
  },
  {
    title: "Give it room",
    body: "Leave clear space around the mark at least a quarter of its height.",
  },
  {
    title: "Write it as Pond",
    body: "One word, capital P. The characters inside Pond are fish, singular and plural.",
  },
];

export default function BrandPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Brand</PageHeader.Label>
        <PageHeader.Title>The Pond mark, wordmark, and icon.</PageHeader.Title>
        <PageHeader.Lede>
          Use these files to link to Pond or write about it. Each one is a
          vector or a full-size image, ready to drop in.
        </PageHeader.Lede>
      </PageHeader.Root>
      <Frame.Section spacing="sm">
        <ul className={styles.assets}>
          {ASSETS.map((asset) => (
            <li key={asset.title} className={styles.asset}>
              <div className={styles.previews}>
                {asset.preview.map((preview) => (
                  <div
                    key={preview.src}
                    className={styles.preview}
                    data-tone={preview.tone}
                  >
                    <Image
                      src={preview.src}
                      width={preview.width}
                      height={preview.height}
                      alt=""
                    />
                  </div>
                ))}
              </div>
              <div className={styles.info}>
                <h2 className={styles.title}>{asset.title}</h2>
                <p className={styles.body}>{asset.body}</p>
                <div className={styles.downloads}>
                  {asset.downloads.map((download) => (
                    <Cta
                      key={download.href}
                      href={download.href}
                      variant="soft"
                      download
                    >
                      {download.label}
                    </Cta>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Usage</Heading.Label>
          <Heading.Title>A few ground rules.</Heading.Title>
        </Heading.Root>
        <dl className={styles.rules}>
          {USAGE.map((rule) => (
            <div key={rule.title} className={styles.rule}>
              <dt>{rule.title}</dt>
              <dd>{rule.body}</dd>
            </div>
          ))}
        </dl>
      </Frame.Section>
    </main>
  );
}

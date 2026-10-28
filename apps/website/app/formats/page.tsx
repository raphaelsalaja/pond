import type { Metadata } from "next";
import { FORMATS_DOCS_URL } from "@/lib/links";
import { Cards } from "../components/cards";
import { Cta } from "../components/cta";
import { Frame } from "../components/frame";
import { Heading } from "../components/heading";
import { PageHeader } from "../components/page-header";
import styles from "./styles.module.css";

export const metadata: Metadata = {
  title: "Formats",
  description:
    "Pond keeps the original of every file you import, with built-in viewers for images, video, audio, PDF, fonts, 3D models, EPUB, ZIP, and HTML.",
};

const GUARANTEES = [
  {
    title: "Kept as it is",
    body: "Pond copies the original bytes into your library and never swaps them for a preview.",
  },
  {
    title: "A preview on every card",
    body: "From a built-in renderer, a generated preview, Eagle's thumbnail, or your system's.",
  },
  {
    title: "Viewers built in",
    body: "Images, video, audio, PDFs, fonts, text, EPUB, ZIP, HTML, and 3D open right in Pond.",
  },
  {
    title: "Always yours to open",
    body: "Open, reveal, copy, drag, or export any original, even when nothing can preview it.",
  },
];

const VIEWERS = [
  {
    format: "JPEG, PNG, GIF, WebP, AVIF, SVG, BMP, ICO",
    card: "Image",
    viewer: "Image",
  },
  {
    format: "HEIC, HEIF, JPEG XL, TIFF",
    card: "Generated WebP",
    viewer: "Generated image preview",
  },
  {
    format: "MP4, WebM, MOV, M4V, MKV",
    card: "Image or video poster",
    viewer: "Video player when the codec is available",
  },
  {
    format: "MP3, WAV, M4A, AAC, FLAC, OGG, Opus",
    card: "File tile or thumbnail",
    viewer: "Audio player when the codec is available",
  },
  { format: "PDF", card: "First page", viewer: "PDF viewer" },
  {
    format: "TTF, OTF, TTC, WOFF, WOFF2",
    card: "System preview or file tile",
    viewer: "Editable specimen and glyphs",
  },
  { format: "TXT, Markdown", card: "Text tile", viewer: "Text viewer" },
  {
    format: "PSD, RAW, Office, iWork, design files",
    card: "System or Eagle preview",
    viewer: "Full-size generated preview",
  },
  {
    format: "GLB, FBX, OBJ, STL, PLY, 3MF, 3DS, DAE",
    card: "System preview or model frame",
    viewer: "3D orbit viewer with animation playback",
  },
  {
    format: "EPUB",
    card: "Cover",
    viewer: "Reader with contents, paging, and type controls",
  },
  {
    format: "ZIP",
    card: "File tile or thumbnail",
    viewer: "Searchable archive contents",
  },
  {
    format: "HTML",
    card: "System preview or file tile",
    viewer: "Offline, scriptless rendering and source",
  },
];

const CATEGORIES = [
  {
    label: "Images",
    extensions:
      "avif png jpg jfif jxl jpe insp gif tiff tif jpeg svg bmp icns ico webp hdr exr hif heic heif tga dds livp base64",
  },
  {
    label: "Camera RAW",
    extensions:
      "arw cr2 cr3 crw dng raf rw2 orf nef nrw raw 3fr erf srw sr2 pef x3f mrw",
  },
  {
    label: "Design and publishing",
    extensions:
      "psd psdt psb ai ait eps xd clip prd fig sketch af afpub afdesign afphoto cdr skt pxd indd indt idml ps",
  },
  {
    label: "Video",
    extensions:
      "afx eva vap 360 ts 3gp mp4 mkv mpg mov m4v webm avi mts wmv flv m2ts f4v av1 hevc rm rmvb vp8 vp9 mpeg ogv",
  },
  { label: "Audio", extensions: "mp3 wav ogg flac aac m4a" },
  {
    label: "Documents and mind maps",
    extensions:
      "pdf key pages number numbers potx pptx ppt doc docx xls xlsx graffle xmind mindnode eddx emmx epub",
  },
  {
    label: "3D, CAD, and scenes",
    extensions: "c4d blend skp dwg glb fbx obj 3ds 3mf dae ifc ply stl blender",
  },
  { label: "Fonts", extensions: "ttf otf ttc woff woff2" },
  { label: "Web", extensions: "url html mhtml webarchive" },
  { label: "Archives", extensions: "zip rar 7z" },
  { label: "Text", extensions: "txt" },
  { label: "Legacy animation", extensions: "swf" },
];

export default function FormatsPage() {
  return (
    <main>
      <PageHeader.Root>
        <PageHeader.Label>Formats</PageHeader.Label>
        <PageHeader.Title>
          Every file you import, kept as it is.
        </PageHeader.Title>
        <PageHeader.Lede>
          Pond stores every readable file, including every format Eagle
          supports. Previews come from Pond's own viewers or from your system's.
        </PageHeader.Lede>
        <PageHeader.Actions>
          <Cta href={FORMATS_DOCS_URL} variant="soft" external>
            Full Reference
          </Cta>
        </PageHeader.Actions>
      </PageHeader.Root>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Guarantees</Heading.Label>
          <Heading.Title>Four promises for every file.</Heading.Title>
        </Heading.Root>
        <Cards.Root columns="4">
          {GUARANTEES.map((guarantee) => (
            <Cards.Item key={guarantee.title}>
              <Cards.Title>{guarantee.title}</Cards.Title>
              <Cards.Body>{guarantee.body}</Cards.Body>
            </Cards.Item>
          ))}
        </Cards.Root>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Viewers</Heading.Label>
          <Heading.Title>What opens in Pond.</Heading.Title>
          <Heading.Lede>
            Playback depends on the codecs your system has. Pond still keeps and
            exports a file it can't play.
          </Heading.Lede>
        </Heading.Root>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Format</th>
                <th scope="col">Card</th>
                <th scope="col">Viewer</th>
              </tr>
            </thead>
            <tbody>
              {VIEWERS.map((row) => (
                <tr key={row.format}>
                  <th scope="row">{row.format}</th>
                  <td>{row.card}</td>
                  <td>{row.viewer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Frame.Section>
      <Frame.Section className={styles.section}>
        <Heading.Root>
          <Heading.Label>Extensions</Heading.Label>
          <Heading.Title>Every Eagle format, by kind.</Heading.Title>
          <Heading.Lede>
            Pond never runs imported HTML, web archives, or SWF content. Formats
            without a viewer keep Open and Export.
          </Heading.Lede>
        </Heading.Root>
        <dl className={styles.categories}>
          {CATEGORIES.map((category) => (
            <div key={category.label} className={styles.category}>
              <dt>{category.label}</dt>
              <dd>
                {category.extensions.split(" ").map((extension) => (
                  <code key={extension}>.{extension}</code>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Frame.Section>
    </main>
  );
}

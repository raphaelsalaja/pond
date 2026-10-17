import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import {
  BLANK_DOCUMENTS,
  type BlankDocumentKind,
  blankDocumentDef,
} from "../../shared/blank-documents";

const APP_DIRS = ["/Applications", "/System/Applications"];

export interface AppDirReader {
  exists: (path: string) => boolean;
  entries: (path: string) => string[];
}

export interface InstalledBlankDocumentApp {
  kind: BlankDocumentKind;
  path: string;
}

const defaultReader: AppDirReader = {
  exists: existsSync,
  entries: (path) => {
    try {
      return readdirSync(path);
    } catch {
      return [];
    }
  },
};

export function listInstalledBlankDocuments(
  reader: AppDirReader = defaultReader,
  platform: NodeJS.Platform = process.platform,
): BlankDocumentKind[] {
  return listInstalledBlankDocumentApps(reader, platform).map(
    (item) => item.kind,
  );
}

export function listInstalledBlankDocumentApps(
  reader: AppDirReader = defaultReader,
  platform: NodeJS.Platform = process.platform,
): InstalledBlankDocumentApp[] {
  if (platform !== "darwin") return [];
  const apps = APP_DIRS.flatMap((dir) =>
    reader.exists(dir)
      ? reader
          .entries(dir)
          .map((name) => ({ name, path: posix.join(dir, name) }))
      : [],
  );
  return BLANK_DOCUMENTS.flatMap((document) => {
    const installed = apps.find((candidate) =>
      document.matchApp(candidate.name),
    );
    return installed ? [{ kind: document.kind, path: installed.path }] : [];
  });
}

export async function writeBlankDocumentFile(
  kind: BlankDocumentKind,
): Promise<string | null> {
  const def = blankDocumentDef(kind);
  if (!def) return null;
  const dir = await mkdtemp(join(tmpdir(), "pond-blank-"));
  const path = join(dir, def.filename);
  await writeFile(path, await blankDocumentBytes(kind));
  return path;
}

async function blankDocumentBytes(kind: BlankDocumentKind): Promise<Buffer> {
  switch (kind) {
    case "photoshop":
      return minimalPsd();
    case "illustrator":
      return minimalPdf();
    case "xd":
      return zipFiles({
        manifest: JSON.stringify({
          name: "Untitled",
          type: "application/vnd.adobe.sparkler.project+dcx",
        }),
      });
    case "word":
      return officeZip("word", "document.xml", WORD_DOCUMENT);
    case "excel":
      return officeZip("xl", "workbook.xml", EXCEL_WORKBOOK, {
        "xl/worksheets/sheet1.xml": EXCEL_SHEET,
      });
    case "powerpoint":
      return officeZip("ppt", "presentation.xml", PPT_PRESENTATION, {
        "ppt/slides/slide1.xml": PPT_SLIDE,
      });
    case "keynote":
    case "pages":
    case "numbers":
      return zipFiles({
        "index.xml": `<?xml version="1.0" encoding="UTF-8"?><document></document>\n`,
      });
  }
}

async function zipFiles(files: Record<string, string>): Promise<Buffer> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [path, body] of Object.entries(files)) {
    zip.file(path, body);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function officeZip(
  part: string,
  documentFile: string,
  documentXml: string,
  extra: Record<string, string> = {},
): Promise<Buffer> {
  return zipFiles({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/${part}/${documentFile}" ContentType="application/vnd.openxmlformats-officedocument.${part === "word" ? "wordprocessingml.document.main+xml" : part === "xl" ? "spreadsheetml.sheet.main+xml" : "presentationml.presentation.main+xml"}"/>
</Types>
`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${part}/${documentFile}"/>
</Relationships>
`,
    [`${part}/${documentFile}`]: documentXml,
    ...extra,
  });
}

const WORD_DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t></w:t></w:r></w:p></w:body>
</w:document>
`;

const EXCEL_WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>
`;

const EXCEL_SHEET = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData/>
</worksheet>
`;

const PPT_PRESENTATION = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
</p:presentation>
`;

const PPT_SLIDE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree/></p:cSld>
</p:sld>
`;

function minimalPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<< /Size 4 /Root 1 0 R >>
startxref
190
%%EOF
`,
  );
}

function minimalPsd(): Buffer {
  const header = Buffer.alloc(26);
  header.write("8BPS", 0, "ascii");
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(3, 12);
  header.writeUInt32BE(1, 14);
  header.writeUInt32BE(1, 18);
  header.writeUInt16BE(8, 22);
  header.writeUInt16BE(3, 24);
  const zeros = Buffer.alloc(12);
  const image = Buffer.alloc(5);
  image.writeUInt16BE(0, 0);
  return Buffer.concat([header, zeros, image]);
}

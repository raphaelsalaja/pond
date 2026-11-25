import { createHash } from "node:crypto";
import {
  appendFileSync,
  createReadStream,
  openAsBlob,
  statSync,
} from "node:fs";
import { basename } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const API = "https://www.virustotal.com/api/v3";
/** Larger files must go through a one-time upload URL. */
const DIRECT_UPLOAD_LIMIT = 32 * 1024 * 1024;
/** The public API allows four requests a minute. */
const REQUEST_SPACING_MS = 15_500;
const POLL_INTERVAL_MS = 30_000;
const ANALYSIS_TIMEOUT_MS = 30 * 60_000;
const WATCHED_ENGINES = ["BitDefender", "Microsoft"];

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error("Usage: node scripts/virustotal-scan.mjs <file>...");
}

const key = process.env.VIRUSTOTAL_API_KEY;
if (!key) {
  console.log(
    "::warning::VIRUSTOTAL_API_KEY is not set; skipping the VirusTotal scan.",
  );
  process.exit(0);
}

let lastRequestAt = 0;

async function request(pathOrUrl, init = {}) {
  const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : API + pathOrUrl;
  const response = await fetch(url, {
    ...init,
    headers: { "x-apikey": key, ...init.headers },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `VirusTotal ${response.status} for ${pathOrUrl}: ${await response.text()}`,
    );
  }
  return response.json();
}

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function upload(path) {
  const target =
    statSync(path).size > DIRECT_UPLOAD_LIMIT
      ? (await request("/files/upload_url")).data
      : "/files";
  const form = new FormData();
  form.append("file", await openAsBlob(path), basename(path));
  const response = await request(target, { method: "POST", body: form });
  return response.data.id;
}

async function waitForAnalysis(id) {
  const deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const response = await request(`/analyses/${id}`);
    if (response?.data.attributes.status === "completed") return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function scan(path) {
  const hash = await sha256(path);
  let report = await request(`/files/${hash}`);
  if (!report) {
    console.log(`Uploading ${basename(path)}`);
    const finished = await waitForAnalysis(await upload(path));
    if (!finished) console.log(`::warning::${basename(path)} is still queued.`);
    report = await request(`/files/${hash}`);
  }
  const attributes = report?.data.attributes ?? {};
  const results = attributes.last_analysis_results ?? {};
  const flagged = Object.entries(results)
    .filter(([, result]) =>
      ["malicious", "suspicious"].includes(result.category),
    )
    .map(([engine, result]) => ({ engine, result: result.result }));
  const finishedEngines = Object.values(results).filter((result) =>
    ["malicious", "suspicious", "undetected", "harmless"].includes(
      result.category,
    ),
  ).length;
  return {
    name: basename(path),
    hash,
    flagged,
    finishedEngines,
    signed: attributes.signature_info?.verified ?? "Unsigned",
    watched: WATCHED_ENGINES.map(
      (engine) => results[engine]?.result ?? results[engine]?.category ?? "—",
    ),
  };
}

const scans = [];
for (const file of files) scans.push(await scan(file));

const lines = [
  "## VirusTotal",
  "",
  `| File | Detections | Signature | ${WATCHED_ENGINES.join(" | ")} |`,
  `| --- | --- | --- | ${WATCHED_ENGINES.map(() => "---").join(" | ")} |`,
  ...scans.map(
    (scan) =>
      `| [${scan.name}](https://www.virustotal.com/gui/file/${scan.hash}) | ${scan.flagged.length} / ${scan.finishedEngines} | ${scan.signed} | ${scan.watched.join(" | ")} |`,
  ),
];
if (scans.some((scan) => scan.flagged.length > 0)) lines.push("");
for (const scan of scans) {
  for (const { engine, result } of scan.flagged) {
    lines.push(`- ${scan.name}: ${engine} reports \`${result}\``);
    console.log(
      `::warning title=VirusTotal::${scan.name} flagged by ${engine}: ${result}`,
    );
  }
}

const summary = `${lines.join("\n")}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

import { cpus, freemem, homedir, platform, release, totalmem } from "node:os";
import { app } from "electron";
import JSZip from "jszip";

function redact(value: string): string {
  return value
    .replaceAll(homedir(), "~")
    .replace(
      /\b(?:token|key|secret|password)=([^&\s]+)/gi,
      (_match, _value) => "credential=[redacted]",
    )
    .replace(/https?:\/\/[^\s"']+/gi, "[redacted-url]");
}

async function libraryHealth() {
  const { debugReportHealth, libraryHealthService } = await import(
    "./library-health"
  );
  const { readQueueSummary } = await import("./pipeline/queue-summary");
  const [overview, queue] = await Promise.all([
    libraryHealthService.overview(),
    readQueueSummary().catch(() => null),
  ]);
  return debugReportHealth({ overview, queue, redact });
}

export async function createDebugReport(): Promise<Buffer> {
  const { conversionCapabilities } = await import("./conversion-capabilities");
  const capabilities = await conversionCapabilities();
  const health = await libraryHealth().catch(() => null);
  const report = {
    generatedAt: new Date().toISOString(),
    app: {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      packaged: app.isPackaged,
    },
    system: {
      platform: platform(),
      release: release(),
      architecture: process.arch,
      cpuCount: cpus().length,
      memory: { free: freemem(), total: totalmem() },
    },
    formats: capabilities.map((capability) => ({
      format: capability.format,
      available: capability.available,
      reason: capability.unavailableReason
        ? redact(capability.unavailableReason)
        : null,
    })),
    libraryHealth: health,
  };
  const archive = new JSZip();
  archive.file("report.json", JSON.stringify(report, null, 2));
  archive.file(
    "README.txt",
    "This report excludes library content, file paths, URLs, credentials, and logs. Library Health lists Save IDs with counts and file checks, without titles.",
  );
  return archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

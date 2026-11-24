const { execFileSync } = require("node:child_process");

const ROLES = [
  [
    "main",
    (command) =>
      command.includes("MacOS/Electron") && !command.includes("--type="),
  ],
  ["renderer", (command) => command.includes("--type=renderer")],
  ["gpu", (command) => command.includes("--type=gpu-process")],
];

function pondProcesses() {
  const listing = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,command="], {
    encoding: "utf8",
  });
  const rows = [];
  for (const line of listing.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const command = match[4];
    if (
      !command.includes("/Pond.app/Contents/") ||
      command.includes("Cursor")
    ) {
      continue;
    }
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssMB: Math.round(Number(match[3]) / 1024),
      role: ROLES.find(([, test]) => test(command))?.[0] ?? "other",
      mcp: command.includes(" --mcp"),
      command,
    });
  }
  return rows;
}

function footprintMB(pid) {
  const text = execFileSync("footprint", ["-p", String(pid)], {
    encoding: "utf8",
  });
  const match = text.match(/Footprint:\s+([\d,.]+)\s+MB/);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

const rows = pondProcesses();
const appMains = new Set(
  rows.filter((row) => row.role === "main" && !row.mcp).map((row) => row.pid),
);
const app = rows.filter(
  (row) => appMains.has(row.pid) || appMains.has(row.ppid),
);
const shown = app.filter((row) =>
  ["main", "renderer", "gpu"].includes(row.role),
);

if (shown.length === 0) {
  console.error("No running Pond window. This skips the MCP server.");
  process.exitCode = 1;
} else {
  for (const row of shown) {
    const physical = footprintMB(row.pid);
    console.log(
      `${row.role.padEnd(10)} pid ${row.pid}  footprint ${physical ?? "?"} MB  rss ${row.rssMB} MB`,
    );
  }
}

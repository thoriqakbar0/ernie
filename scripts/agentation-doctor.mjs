import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const executable = path.join(root, "node_modules", ".bin", "agentation-mcp");
const configPath = path.join(root, ".mcp.json");
const errors = [];

if (!fs.existsSync(executable)) errors.push("agentation-mcp is not installed locally");
try {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const args = config.mcpServers?.agentation?.args;
  if (!Array.isArray(args) || !args.includes("http://127.0.0.1:4748")) errors.push(".mcp.json is not connected to Ernie's Agentation service");
} catch {
  errors.push(".mcp.json is missing or invalid");
}

try {
  const response = await fetch("http://127.0.0.1:4748/health", { signal: AbortSignal.timeout(1_000) });
  if (!response.ok || (await response.json()).status !== "ok") errors.push("Agentation HTTP service is unhealthy");
} catch {
  errors.push("Agentation HTTP service is not running; start `pnpm dev` or `pnpm agentation:server`");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exitCode = 1;
} else {
  console.log("✓ Local package installed");
  console.log("✓ Project MCP bridge configured");
  console.log("✓ Ernie Agentation service healthy on 127.0.0.1:4748");
}

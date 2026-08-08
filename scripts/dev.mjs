import { spawn } from "node:child_process";
import process from "node:process";

const agentationUrl = "http://127.0.0.1:4748";
const children = new Set();
let stopping = false;

function spawnGroup(command, args, options = {}) {
  const child = spawn(command, args, { ...options, detached: true });
  children.add(child);
  child.once("close", () => children.delete(child));
  return child;
}

function stopChild(child, signal = "SIGTERM") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error?.code !== "ESRCH") throw error; }
}

function stopAll(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  const groupPids = [...children].flatMap((child) => child.pid === undefined ? [] : [child.pid]);
  for (const child of children) stopChild(child, signal);
  setTimeout(() => {
    for (const pid of groupPids) {
      try { process.kill(-pid, "SIGKILL"); }
      catch (error) { if (error?.code !== "ESRCH") throw error; }
    }
  }, 1_500);
}

async function isAgentationHealthy() {
  try {
    const response = await fetch(`${agentationUrl}/health`, { signal: AbortSignal.timeout(500) });
    return response.ok && (await response.json()).status === "ok";
  } catch {
    return false;
  }
}

async function waitForAgentation(child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isAgentationHealthy()) return;
    if (child.exitCode !== null) throw new Error(`Agentation exited with code ${child.exitCode}.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Agentation did not become healthy at ${agentationUrl}.`);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => { stopAll(signal); });
}

let agentation;
try {
  if (!(await isAgentationHealthy())) {
    agentation = spawnGroup("pnpm", ["run", "agentation:server"], {
      env: process.env,
      stdio: ["ignore", "ignore", "inherit"],
    });
    await waitForAgentation(agentation);
  }

  const electron = spawnGroup("pnpm", ["exec", "electron-vite", "dev"], {
    env: { ...process.env, ERNIE_ENABLE_CDP: "1" },
    stdio: "inherit",
  });
  const code = await new Promise((resolve) => electron.once("close", (exitCode) => resolve(exitCode ?? 1)));
  stopAll();
  process.exitCode = code;
} catch (error) {
  stopAll();
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

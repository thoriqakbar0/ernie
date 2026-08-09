import { spawn } from "node:child_process";
import process from "node:process";

const children = new Set();
let stopping = false;

function spawnGroup(command, args, options = {}) {
  const child = spawn(command, args, { ...options, detached: true });
  children.add(child);
  child.once("close", () => children.delete(child));
  return child;
}

function stopChild(child, signal = "SIGTERM") {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
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
  }, 1_500).unref();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => stopAll(signal));

try {
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

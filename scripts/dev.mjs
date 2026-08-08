import { spawn } from "node:child_process";
import process from "node:process";

let child;
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping || child?.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  stopping = true;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error?.code !== "ESRCH") throw error; }
  const pid = child.pid;
  setTimeout(() => {
    try { process.kill(-pid, "SIGKILL"); }
    catch (error) { if (error?.code !== "ESRCH") throw error; }
  }, 1_500).unref();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => stop(signal));

child = spawn("pnpm", ["exec", "electron-vite", "dev"], {
  env: { ...process.env, ERNIE_ENABLE_CDP: "1" },
  stdio: "inherit",
  detached: true,
});
const code = await new Promise((resolve) => child.once("close", (exitCode) => resolve(exitCode ?? 1)));
stop();
process.exitCode = code;

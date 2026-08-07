import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, IpythonToolDetails } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface RuntimeRecord {
  readonly provider: "modal";
  readonly runtimeId: string;
  readonly cwd: string;
  readonly createdAt: string;
  readonly active: boolean;
}

interface RemoteConfig {
  readonly version: 1;
  readonly projects: Readonly<Record<string, RuntimeRecord>>;
}

interface BridgeResponse {
  readonly ok: boolean;
  readonly runtimeId?: string;
  readonly status?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly result?: string;
  readonly durationMs?: number;
  readonly error?: string;
  readonly restored?: readonly string[];
  readonly failed?: readonly { readonly name: string; readonly reason: string }[];
}

const IpythonParams = Type.Object({
  code: Type.String({ description: "Python code or a %%bash cell to execute in the persistent remote IPython kernel" }),
});

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modalProject = join(packageRoot, "providers", "modal");
const configPath = join(process.env.PRIME_AGENT_DIR ?? join(homedir(), ".prime", "agent"), "remote.json");
const extensionCwd = resolve(process.cwd());

function emptyConfig(): RemoteConfig {
  return { version: 1, projects: {} };
}

function isRuntimeRecord(value: unknown): value is RuntimeRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.provider === "modal" &&
    typeof record.runtimeId === "string" &&
    typeof record.cwd === "string" &&
    typeof record.createdAt === "string" &&
    (record.active === undefined || typeof record.active === "boolean")
  );
}

function readConfig(): RemoteConfig {
  if (!existsSync(configPath)) return emptyConfig();
  try {
    const decoded: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    if (typeof decoded !== "object" || decoded === null) return emptyConfig();
    const candidate = decoded as Record<string, unknown>;
    if (candidate.version !== 1 || typeof candidate.projects !== "object" || candidate.projects === null) {
      return emptyConfig();
    }
    const projects: Record<string, RuntimeRecord> = {};
    for (const [cwd, value] of Object.entries(candidate.projects)) {
      if (isRuntimeRecord(value)) projects[resolve(cwd)] = { ...value, active: value.active !== false };
    }
    return { version: 1, projects };
  } catch {
    return emptyConfig();
  }
}

function writeConfig(config: RemoteConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function runtimeFor(cwd: string): RuntimeRecord | undefined {
  return readConfig().projects[resolve(cwd)];
}

function saveRuntime(runtime: RuntimeRecord): void {
  const config = readConfig();
  writeConfig({ version: 1, projects: { ...config.projects, [resolve(runtime.cwd)]: runtime } });
}

function removeRuntime(cwd: string): RuntimeRecord | undefined {
  const config = readConfig();
  const key = resolve(cwd);
  const existing = config.projects[key];
  const projects = { ...config.projects };
  delete projects[key];
  writeConfig({ version: 1, projects });
  return existing;
}

function parseBridgeResponse(stdout: string, stderr: string): BridgeResponse {
  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const decoded: unknown = JSON.parse(lines[index]!);
      if (typeof decoded === "object" && decoded !== null && "ok" in decoded && typeof decoded.ok === "boolean") {
        return decoded as BridgeResponse;
      }
    } catch {
      // Modal may print progress before the final JSON record.
    }
  }
  return { ok: false, error: stderr.trim() || stdout.trim() || "Modal bridge returned no JSON response" };
}

async function callBridge(request: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<BridgeResponse> {
  const child = spawn(
    process.env.PRIME_AGENT_REMOTE_UV ?? "uv",
    ["run", "--project", modalProject, "python", "-m", "remote_modal_bridge"],
    {
      cwd: modalProject,
      env: {
        ...process.env,
        UV_PROJECT_ENVIRONMENT:
          process.env.PRIME_AGENT_REMOTE_VENV ?? join(homedir(), ".cache", "prime-agent-remote", "venv"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });

  const abort = () => child.kill("SIGTERM");
  signal?.addEventListener("abort", abort, { once: true });
  child.stdin.end(`${JSON.stringify(request)}\n`);

  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  }).finally(() => signal?.removeEventListener("abort", abort));

  if (signal?.aborted) return { ok: false, error: "Remote execution was cancelled" };
  const response = parseBridgeResponse(stdout, stderr);
  if (exitCode !== 0 && response.ok) {
    return { ok: false, error: stderr.trim() || `Modal bridge exited with code ${exitCode}` };
  }
  return response;
}

function snapshotPathFor(sessionDir: string, sessionId: string): string {
  return join(dirname(sessionDir), "session-artifacts", sessionId, "kernel-state.dill");
}

function formatExecution(response: BridgeResponse): { text: string; details: IpythonToolDetails; isError: boolean } {
  let text = response.stdout ?? "";
  if (response.stderr) text += `${text ? "\n" : ""}${response.stderr}`;
  if (response.result) text += `${text ? "\n" : ""}${response.result}`;
  if (!response.ok && response.error) text += `${text ? "\n" : ""}${response.error}`;
  const isError = !response.ok || response.status === "error";
  return {
    text,
    details: {
      durationMs: response.durationMs,
      status: isError ? "error" : "ok",
      stdout: response.stdout,
      stderr: response.stderr,
      result: response.result,
      ...(isError && response.error
        ? { errorEname: "RemoteError", error: { ename: "RemoteError", evalue: response.error, traceback: [response.error] } }
        : {}),
    },
    isError,
  };
}

export default function remoteExtension(pi: ExtensionAPI) {
  const configuredAtLoad = runtimeFor(extensionCwd);

  if (configuredAtLoad?.active) {
    pi.registerTool({
      name: "ipython",
      label: "ipython · remote",
      description:
        "Execute Python scratchpad code and %%bash cells in a persistent Modal-backed IPython kernel. Variables, files, and processes live in the remote runtime and survive local Prime Agent restarts while the runtime is active.",
      promptSnippet: "ipython - persistent remote Python scratchpad and %%bash orchestration",
      executionMode: "sequential",
      parameters: IpythonParams,
      async execute(_toolCallId, params, signal, onUpdate, ctx) {
        const runtime = runtimeFor(ctx.cwd);
        if (!runtime?.active) {
          return {
            content: [{ type: "text", text: "Remote runtime is not active. Run /remote clone modal." }],
            details: { status: "error", errorEname: "RemoteNotConfigured" } satisfies IpythonToolDetails,
            isError: true,
          };
        }
        onUpdate?.({ content: [{ type: "text", text: "Executing in Modal..." }], details: { status: "starting" } });
        const response = await callBridge(
          { action: "execute", runtimeId: runtime.runtimeId, code: params.code },
          signal,
        );
        const formatted = formatExecution(response);
        return { content: [{ type: "text", text: formatted.text }], details: formatted.details, isError: formatted.isError };
      },
    });
  }

  pi.registerCommand("remote", {
    description: "Switch IPython between this machine and Modal",
    handler: async (args, ctx) => {
      const target = args.trim() || "show";

      if (target === "modal") {
        const existing = runtimeFor(ctx.cwd);
        if (existing?.active) {
          ctx.ui.notify("Already running on Modal.", "info");
          return;
        }
        const runtime: RuntimeRecord = existing
          ? { ...existing, active: true }
          : {
              provider: "modal",
              runtimeId: `pa-${randomUUID().slice(0, 12)}`,
              cwd: resolve(ctx.cwd),
              createdAt: new Date().toISOString(),
              active: true,
            };
        ctx.ui.setStatus("remote", existing ? "Reconnecting to Modal" : "Moving to Modal");
        const response = await callBridge(
          {
            action: "ensure",
            runtimeId: runtime.runtimeId,
            ...(existing ? {} : { workspacePath: runtime.cwd }),
          },
          ctx.signal,
        );
        if (!response.ok) {
          ctx.ui.setStatus("remote", undefined);
          ctx.ui.notify(response.error ?? "Could not start Modal", "error");
          return;
        }
        const snapshotPath = snapshotPathFor(ctx.sessionManager.getSessionDir(), ctx.sessionManager.getSessionId());
        if (!existing && existsSync(snapshotPath)) {
          const restored = await callBridge(
            { action: "restore", runtimeId: runtime.runtimeId, snapshotPath },
            ctx.signal,
          );
          if (!restored.ok) {
            await callBridge({ action: "stop", runtimeId: runtime.runtimeId }, ctx.signal);
            ctx.ui.setStatus("remote", undefined);
            ctx.ui.notify(restored.error ?? "Could not move local IPython state to Modal", "error");
            return;
          }
          if ((restored.failed?.length ?? 0) > 0) {
            const skipped = restored.failed!.map(({ name }) => name).join(", ");
            ctx.ui.notify(`Some local names could not move: ${skipped}`, "warning");
          }
        }
        saveRuntime(runtime);
        await ctx.reload();
        ctx.ui.notify("IPython is now running on Modal.", "info");
        return;
      }

      if (target === "local") {
        const runtime = runtimeFor(ctx.cwd);
        if (!runtime) {
          ctx.ui.notify("Already running locally.", "info");
          return;
        }
        const response = await callBridge({ action: "stop", runtimeId: runtime.runtimeId }, ctx.signal);
        if (!response.ok) {
          ctx.ui.notify(response.error ?? "Could not stop Modal", "error");
          return;
        }
        removeRuntime(ctx.cwd);
        ctx.ui.setStatus("remote", undefined);
        await ctx.reload();
        ctx.ui.notify("IPython is now running locally.", "info");
        return;
      }

      if (target === "show") {
        const runtime = runtimeFor(ctx.cwd);
        ctx.ui.notify(runtime?.active ? "IPython is running on Modal." : "IPython is running locally.", "info");
        return;
      }

      ctx.ui.notify("Usage: /remote modal | /remote local", "error");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const runtime = runtimeFor(ctx.cwd);
    if (!runtime?.active) return;
    ctx.ui.setStatus("remote", `Modal: ${runtime.runtimeId}`);
    const ensured = await callBridge({ action: "ensure", runtimeId: runtime.runtimeId }, ctx.signal);
    if (!ensured.ok) {
      const current = runtimeFor(ctx.cwd);
      if (current?.active && current.runtimeId === runtime.runtimeId) {
        ctx.ui.notify(ensured.error ?? "Remote runtime unavailable", "error");
      }
      return;
    }
  });
}

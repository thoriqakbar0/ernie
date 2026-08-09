import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import type { AgentStatus, WorkspaceAgent, WorkspaceCatalogEvent, WorkspaceProject, WorkspaceSnapshot, WorkspaceSettledWorktree, WorkspaceWorktree } from "../shared/workspace";

const DiagnosticSchema = Schema.Struct({
  type: Schema.optionalKey(Schema.String), severity: Schema.optionalKey(Schema.String),
  level: Schema.optionalKey(Schema.String), message: Schema.optionalKey(Schema.String),
});
const PrimeSessionSchema = Schema.Struct({
  id: Schema.String, lifecycle: Schema.Literals(["draft", "live", "archived"]),
  activity: Schema.Literals(["working", "idle"]), isSessionActive: Schema.Boolean,
  activeSessionId: Schema.optionalKey(Schema.String), sessionId: Schema.String,
  sessionName: Schema.optionalKey(Schema.String), cwd: Schema.String, isStreaming: Schema.Boolean,
  created: Schema.optionalKey(Schema.String), modified: Schema.optionalKey(Schema.String),
  lastActivityAt: Schema.optionalKey(Schema.String), firstMessage: Schema.optionalKey(Schema.String),
  runtimeKind: Schema.optionalKey(Schema.Literals(["top-level", "subagent"])),
  parentActiveSessionId: Schema.optionalKey(Schema.String), parentSessionId: Schema.optionalKey(Schema.String),
  rlmChildId: Schema.optionalKey(Schema.String), summary: Schema.optionalKey(Schema.String),
  answerPreview: Schema.optionalKey(Schema.String), taskState: Schema.optionalKey(Schema.Literals(["needs_input", "completed"])),
  workerState: Schema.optionalKey(Schema.Literals(["starting", "ready", "recovering", "failed"])),
  diagnostics: Schema.optionalKey(Schema.Array(DiagnosticSchema)),
});
type PrimeSession = typeof PrimeSessionSchema.Type;
const PrimeListJsonSchema = Schema.fromJsonString(Schema.Struct({ sessions: Schema.Array(PrimeSessionSchema) }));

const StoredWorktreeSchema = Schema.Struct({
  projectId: Schema.String,
  path: Schema.String,
  branch: Schema.NullOr(Schema.String),
  managed: Schema.Boolean,
  lifecycle: Schema.Literals(["active", "settled"]),
  settledAt: Schema.NullOr(Schema.String),
});
type StoredWorktree = typeof StoredWorktreeSchema.Type;
const ProjectStoreV1Schema = Schema.Struct({ version: Schema.Literal(1), paths: Schema.Array(Schema.String) });
const ProjectStoreV2Schema = Schema.Struct({
  version: Schema.Literal(2), paths: Schema.Array(Schema.String), worktrees: Schema.Array(StoredWorktreeSchema),
});
const ProjectStoreJsonSchema = Schema.fromJsonString(Schema.Union([ProjectStoreV1Schema, ProjectStoreV2Schema]));

interface GitWorktreeRecord {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly locked: boolean;
}
interface ProjectWorktrees { readonly projectPath: string; readonly records: readonly GitWorktreeRecord[]; }
interface CommandOutput { readonly stdout: string; readonly stderr: string; readonly exitCode: number; }

/** Configuration for the workspace catalog and its external executables. */
export interface WorkspaceCatalogOptions {
  readonly repositoryPath: string;
  readonly gitPath?: string;
  readonly nodePath?: string;
  readonly primeAgentCliPath?: string;
  readonly refreshIntervalMs?: number | false;
  readonly environment?: Readonly<Record<string, string>>;
  readonly projectStorePath?: string;
  /** Root reserved for checkouts created by Ernie. */
  readonly managedWorktreeRoot?: string;
}

export class WorkspaceCatalogCommandError extends Schema.TaggedErrorClass<WorkspaceCatalogCommandError>()(
  "WorkspaceCatalogCommandError", { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}
export class WorkspaceCatalogParseError extends Schema.TaggedErrorClass<WorkspaceCatalogParseError>()(
  "WorkspaceCatalogParseError", { source: Schema.Literals(["git", "prime-agent"]), message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}
export class WorkspaceCatalogProjectError extends Schema.TaggedErrorClass<WorkspaceCatalogProjectError>()(
  "WorkspaceCatalogProjectError", { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}
export class WorkspaceCatalogWorktreeError extends Schema.TaggedErrorClass<WorkspaceCatalogWorktreeError>()(
  "WorkspaceCatalogWorktreeError", {
    reason: Schema.Literals([
      "unknown_worktree", "primary_worktree", "worktree_busy", "invalid_branch", "branch_exists", "no_head",
      "path_conflict", "not_managed", "not_settled", "dirty_worktree", "locked_worktree", "checkout_missing",
    ]),
    message: Schema.String,
    worktreeId: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}
export type WorkspaceCatalogError = WorkspaceCatalogCommandError | WorkspaceCatalogParseError | WorkspaceCatalogProjectError | WorkspaceCatalogWorktreeError;

/** Stateful catalog of projects, active worktrees, settled worktrees, and Prime Agent sessions. */
export class WorkspaceCatalog extends Context.Service<WorkspaceCatalog, {
  readonly current: Effect.Effect<WorkspaceSnapshot>;
  readonly events: Stream.Stream<WorkspaceCatalogEvent>;
  readonly start: Effect.Effect<void, WorkspaceCatalogError>;
  readonly refresh: Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
  readonly addProject: (path: string) => Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
  readonly archiveProject: (projectId: string) => Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
  readonly createWorktree: (sourceWorktreeId: string, branch: string) => Effect.Effect<{ readonly snapshot: WorkspaceSnapshot; readonly worktreeId: string }, WorkspaceCatalogError>;
  readonly archiveWorktree: (worktreeId: string) => Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
  readonly restoreWorktree: (worktreeId: string) => Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
  readonly removeWorktreeCheckout: (worktreeId: string) => Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
}>()("@ernie/main/WorkspaceCatalog") {}

function bounded(value: string, limit: number): string {
  const normalized = value.trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}…`;
}
function commandError(operation: string, message: string, cause?: unknown): WorkspaceCatalogCommandError {
  return new WorkspaceCatalogCommandError({ operation, message, ...(cause === undefined ? {} : { cause }) });
}
function parseError(source: "git" | "prime-agent", message: string, cause?: unknown): WorkspaceCatalogParseError {
  return new WorkspaceCatalogParseError({ source, message, ...(cause === undefined ? {} : { cause }) });
}
function projectError(operation: string, message: string, cause?: unknown): WorkspaceCatalogProjectError {
  return new WorkspaceCatalogProjectError({ operation, message, ...(cause === undefined ? {} : { cause }) });
}
function worktreeError(reason: WorkspaceCatalogWorktreeError["reason"], message: string, worktreeId?: string, cause?: unknown): WorkspaceCatalogWorktreeError {
  return new WorkspaceCatalogWorktreeError({ reason, message, ...(worktreeId === undefined ? {} : { worktreeId }), ...(cause === undefined ? {} : { cause }) });
}
function runWindowsTaskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", ...(force ? ["/F"] : [])], { windowsHide: true, stdio: "ignore" });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error === undefined) resolve(); else reject(error);
    };
    const timeout = setTimeout(() => {
      killer.kill("SIGKILL");
      finish(new Error("taskkill did not exit within 2 seconds"));
    }, 2_000);
    timeout.unref();
    killer.once("error", (cause) => finish(cause));
    killer.once("close", (code) => code === 0 ? finish() : finish(new Error(`taskkill exited with ${code ?? "unknown"}`)));
  });
}
function signalCommandTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") throw new Error("Windows process trees must be terminated through taskkill");
  try { process.kill(-child.pid, signal); }
  catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) throw cause;
  }
}

function commandTreeAlive(child: ChildProcess): boolean {
  if (child.pid === undefined) return false;
  if (process.platform === "win32") return child.exitCode === null && child.signalCode === null;
  try { process.kill(-child.pid, 0); return true; }
  catch (cause) {
    if (cause instanceof Error && "code" in cause && (cause.code === "ESRCH" || cause.code === "EPERM")) return false;
    throw cause;
  }
}
function runCommandOutput(
  executable: string, args: readonly string[], cwd: string, environment: Readonly<Record<string, string>>,
  operation: string, allowedExitCodes: readonly number[] = [0],
): Effect.Effect<CommandOutput, WorkspaceCatalogCommandError> {
  return Effect.callback<CommandOutput, WorkspaceCatalogCommandError>((resume) => {
    const child = spawn(executable, [...args], {
      cwd, env: { ...process.env, ...environment }, windowsHide: true,
      detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = []; const stderr: Buffer[] = [];
    let stdoutBytes = 0; let stderrBytes = 0; let completed = false;
    let timeout: NodeJS.Timeout | undefined; let killTimer: NodeJS.Timeout | undefined; let reapTimer: NodeJS.Timeout | undefined;
    let forcedError: WorkspaceCatalogCommandError | undefined;
    const finish = (effect: Effect.Effect<CommandOutput, WorkspaceCatalogCommandError>) => {
      if (completed) return;
      completed = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (reapTimer !== undefined) clearTimeout(reapTimer);
      resume(effect);
    };
    const finishForced = (error: WorkspaceCatalogCommandError) => {
      if (completed || reapTimer !== undefined) return;
      if (process.platform === "win32") { finish(Effect.fail(error)); return; }
      try { signalCommandTree(child, "SIGKILL"); } catch { finish(Effect.fail(error)); return; }
      if (!commandTreeAlive(child)) { finish(Effect.fail(error)); return; }
      const deadline = Date.now() + 2_000;
      const poll = () => {
        if (!commandTreeAlive(child) || Date.now() >= deadline) { finish(Effect.fail(error)); return; }
        reapTimer = setTimeout(poll, 50);
        reapTimer.unref();
      };
      reapTimer = setTimeout(poll, 0);
      reapTimer.unref();
    };
    let windowsForceStarted = false; let windowsTaskkillComplete = false; let childClosed = false;
    const finishWindowsTree = (error: WorkspaceCatalogCommandError) => {
      windowsTaskkillComplete = true;
      if (childClosed) { finish(Effect.fail(error)); return; }
      reapTimer = setTimeout(() => finish(Effect.fail(commandError(operation, `${error.message}; Windows child was not reaped after taskkill`))), 2_000);
      reapTimer.unref();
    };
    const forceWindowsTree = (error: WorkspaceCatalogCommandError) => {
      if (completed || windowsForceStarted || child.pid === undefined) return;
      windowsForceStarted = true;
      if (reapTimer !== undefined) { clearTimeout(reapTimer); reapTimer = undefined; }
      void runWindowsTaskkill(child.pid, true).then(
        () => finishWindowsTree(error),
        (cause) => finish(Effect.fail(commandError(operation, `${error.message}; Windows process-tree cleanup failed`, cause))),
      );
    };
    const terminate = (error: WorkspaceCatalogCommandError) => {
      if (completed || forcedError !== undefined) return;
      forcedError = error;
      if (process.platform === "win32") {
        if (child.pid === undefined) { finish(Effect.fail(error)); return; }
        void runWindowsTaskkill(child.pid, false).then(
          () => finishWindowsTree(error),
          () => forceWindowsTree(error),
        );
        killTimer = setTimeout(() => forceWindowsTree(error), 2_000);
        killTimer.unref();
        return;
      }
      try { signalCommandTree(child, "SIGTERM"); } catch { /* close or the fallback reports completion */ }
      killTimer = setTimeout(() => {
        try { signalCommandTree(child, "SIGKILL"); } catch { /* process already exited */ }
        finishForced(error);
      }, 2_000);
      killTimer.unref();
    };
    const collect = (chunks: Buffer[], limit: number, current: number, chunk: Buffer): number => {
      const remaining = limit - current;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      const total = current + chunk.length;
      if (total > limit) terminate(commandError(operation, `${operation} produced too much output`));
      return total;
    };
    child.stdout.on("data", (chunk: Buffer) => { stdoutBytes = collect(stdout, 32 * 1024 * 1024, stdoutBytes, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderrBytes = collect(stderr, 4 * 1024 * 1024, stderrBytes, chunk); });
    child.once("error", (cause) => finish(Effect.fail(forcedError ?? commandError(operation, bounded(cause.message, 1_024), cause))));
    child.once("close", (code, signal) => {
      childClosed = true;
      if (forcedError !== undefined) {
        if (process.platform !== "win32") finishForced(forcedError);
        else if (windowsTaskkillComplete) finish(Effect.fail(forcedError));
        return;
      }
      const output: CommandOutput = {
        stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8"), exitCode: code ?? -1,
      };
      if (code !== null && allowedExitCodes.includes(code)) finish(Effect.succeed(output));
      else finish(Effect.fail(commandError(operation, bounded(output.stderr, 4_096) || `${operation} exited with ${signal ?? code ?? "unknown"}`)));
    });
    timeout = setTimeout(() => terminate(commandError(operation, `${operation} timed out`)), 60_000);
    timeout.unref();
    return Effect.gen(function* () {
      if (completed) return;
      if (process.platform === "win32") {
        if (child.pid !== undefined) yield* Effect.tryPromise(() => runWindowsTaskkill(child.pid!, true)).pipe(Effect.ignore);
        return;
      }
      try { signalCommandTree(child, "SIGTERM"); } catch { /* already exited */ }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!commandTreeAlive(child)) return;
        yield* Effect.sleep("100 millis");
      }
      try { signalCommandTree(child, "SIGKILL"); } catch { /* already exited */ }
      for (let attempt = 0; attempt < 20 && commandTreeAlive(child); attempt += 1) yield* Effect.sleep("50 millis");
    });
  });
}
function runCommand(executable: string, args: readonly string[], cwd: string, environment: Readonly<Record<string, string>>, operation: string) {
  return runCommandOutput(executable, args, cwd, environment, operation).pipe(Effect.map((output) => output.stdout));
}
function parseGitWorktrees(output: string): Effect.Effect<readonly GitWorktreeRecord[], WorkspaceCatalogParseError> {
  return Effect.try({
    try: () => output.split("\0\0").filter((record) => record.length > 0).flatMap((record) => {
      let path: string | undefined; let head: string | undefined; let branch: string | null = null;
      let detached = false; let locked = false; let prunable = false;
      for (const field of record.split("\0")) {
        const separator = field.indexOf(" "); const key = separator < 0 ? field : field.slice(0, separator);
        const value = separator < 0 ? "" : field.slice(separator + 1);
        if (key === "worktree") path = resolve(value);
        else if (key === "HEAD") head = value;
        else if (key === "branch") branch = value.replace(/^refs\/heads\//u, "");
        else if (key === "detached") detached = true;
        else if (key === "locked") locked = true;
        else if (key === "prunable") prunable = true;
      }
      if (path === undefined || head === undefined) throw new Error("A Git worktree record omitted worktree or HEAD");
      return prunable ? [] : [{ path, head, branch, detached, locked }];
    }),
    catch: (cause) => parseError("git", "Could not decode git worktree porcelain output", cause),
  });
}
function containsPath(parentPath: string, candidatePath: string): boolean {
  const child = relative(parentPath, candidatePath);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}
function agentStatus(session: PrimeSession): AgentStatus {
  const hasError = session.workerState === "failed" || session.diagnostics?.some((diagnostic) => {
    const level = diagnostic.type ?? diagnostic.severity ?? diagnostic.level ?? "";
    return level.toLowerCase() === "error" || level.toLowerCase() === "fatal";
  }) === true;
  if (hasError) return "failed";
  if (session.activity === "working" || session.isStreaming || session.isSessionActive) return "working";
  if (session.taskState === "needs_input") return "waiting";
  if (session.taskState === "completed" || session.lifecycle === "archived") return "completed";
  if (session.activeSessionId !== undefined || session.workerState === "ready") return "idle";
  return "disconnected";
}
function orderedProjectRecords(projectPath: string, records: readonly GitWorktreeRecord[]): readonly GitWorktreeRecord[] {
  const sourceIndex = records.findIndex((record) => containsPath(record.path, projectPath));
  if (sourceIndex <= 0) return records;
  return [records[sourceIndex]!, ...records.slice(0, sourceIndex), ...records.slice(sourceIndex + 1)];
}
function makeSnapshot(discovered: readonly ProjectWorktrees[], sessions: readonly PrimeSession[], stored: readonly StoredWorktree[]): WorkspaceSnapshot {
  const claimed = new Set<string>();
  const activeRecords: Array<{ record: GitWorktreeRecord; stored?: StoredWorktree }> = [];
  const settledRecords: Array<{ record: GitWorktreeRecord; stored: StoredWorktree; present: boolean }> = [];
  const projects: WorkspaceProject[] = [];

  for (const { projectPath, records: rawRecords } of discovered) {
    const projectStored = stored.filter((entry) => entry.projectId === projectPath);
    const activeIds: string[] = []; const settledIds: string[] = [];
    for (const record of orderedProjectRecords(projectPath, rawRecords)) {
      if (claimed.has(record.path)) continue;
      claimed.add(record.path);
      const metadata = projectStored.find((entry) => entry.path === record.path);
      if (metadata?.lifecycle === "settled") {
        settledIds.push(record.path); settledRecords.push({ record, stored: metadata, present: true });
      } else {
        activeIds.push(record.path); activeRecords.push({ record, ...(metadata === undefined ? {} : { stored: metadata }) });
      }
    }
    for (const metadata of projectStored) {
      if (claimed.has(metadata.path)) continue;
      if (metadata.lifecycle === "settled" || metadata.managed) {
        claimed.add(metadata.path);
        settledIds.push(metadata.path);
        settledRecords.push({
          record: { path: metadata.path, head: "", branch: metadata.branch, detached: metadata.branch === null, locked: false },
          stored: { ...metadata, lifecycle: "settled" }, present: false,
        });
      }
    }
    projects.push({ id: projectPath, path: projectPath, label: basename(projectPath), worktreeIds: activeIds });
  }

  const byLongestPath = [...activeRecords].sort((a, b) => b.record.path.length - a.record.path.length);
  const located = sessions.flatMap((session) => {
    const cwd = resolve(session.cwd); const found = byLongestPath.find(({ record }) => containsPath(record.path, cwd));
    return found === undefined ? [] : [{ session, worktreeId: found.record.path }];
  });
  const idBySession = new Map(located.map(({ session }) => [session.sessionId, session.activeSessionId ?? session.sessionId]));
  const worktreeByAgent = new Map(located.map(({ session, worktreeId }) => [session.activeSessionId ?? session.sessionId, worktreeId]));
  const agents: WorkspaceAgent[] = located.map(({ session, worktreeId }) => {
    const parentAgentId = session.parentActiveSessionId ?? (session.parentSessionId === undefined ? undefined : idBySession.get(session.parentSessionId) ?? session.parentSessionId);
    const name = bounded(session.sessionName || session.firstMessage || (session.runtimeKind === "subagent" ? "Subagent" : "Agent"), 120);
    return {
      id: session.activeSessionId ?? session.sessionId,
      ...(session.activeSessionId === undefined ? {} : { activeSessionId: session.activeSessionId }), sessionId: session.sessionId, worktreeId,
      ...(parentAgentId === undefined ? {} : { parentAgentId }), ...(session.rlmChildId === undefined ? {} : { childId: session.rlmChildId }),
      name, summary: bounded(session.summary ?? "", 1_000), status: agentStatus(session),
      runtimeKind: session.runtimeKind === "subagent" ? "subagent" : "root",
      ...(session.lastActivityAt === undefined ? {} : { lastActivityAt: session.lastActivityAt }),
      ...(session.answerPreview === undefined ? {} : { answerPreview: bounded(session.answerPreview, 4_000) }),
    };
  });
  const parentByWorktree = new Map<string, string>();
  for (const agent of agents) {
    if (agent.parentAgentId === undefined) continue;
    const parentWorktreeId = worktreeByAgent.get(agent.parentAgentId);
    if (parentWorktreeId !== undefined && parentWorktreeId !== agent.worktreeId && !parentByWorktree.has(agent.worktreeId)) parentByWorktree.set(agent.worktreeId, parentWorktreeId);
  }
  const toActive = ({ record, stored: metadata }: { record: GitWorktreeRecord; stored?: StoredWorktree }): WorkspaceWorktree => ({
    id: record.path, path: record.path, label: record.branch ?? basename(record.path), branch: record.branch,
    managed: metadata?.managed ?? false, checkoutPresent: true, locked: record.locked,
    ...(parentByWorktree.has(record.path) ? { parentWorktreeId: parentByWorktree.get(record.path)! } : {}),
  });
  const worktrees = activeRecords.map(toActive);
  const settledWorktrees = settledRecords.map(({ record, stored: metadata, present }): WorkspaceSettledWorktree => ({
    id: record.path, path: record.path, label: record.branch ?? metadata.branch ?? basename(record.path),
    branch: record.branch ?? metadata.branch, managed: metadata.managed, checkoutPresent: present, locked: record.locked,
    projectId: metadata.projectId, settledAt: metadata.settledAt ?? new Date(0).toISOString(),
  }));
  return { projects, worktrees, settledWorktrees, agents, updatedAt: new Date().toISOString() };
}
function snapshotWithoutProject(snapshot: WorkspaceSnapshot, projectId: string): WorkspaceSnapshot {
  const projects = snapshot.projects.filter((project) => project.id !== projectId);
  const activeIds = new Set(projects.flatMap((project) => project.worktreeIds));
  return { projects, worktrees: snapshot.worktrees.filter((worktree) => activeIds.has(worktree.id)), settledWorktrees: (snapshot.settledWorktrees ?? []).filter((worktree) => worktree.projectId !== projectId), agents: snapshot.agents.filter((agent) => activeIds.has(agent.worktreeId)), updatedAt: new Date().toISOString() };
}
function upsertStored(records: readonly StoredWorktree[], next: StoredWorktree): readonly StoredWorktree[] {
  return [...records.filter((entry) => !(entry.projectId === next.projectId && entry.path === next.path)), next];
}
function branchSlug(branch: string): string {
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 64) || "worktree";
  return `${slug}-${createHash("sha256").update(branch).digest("hex").slice(0, 8)}`;
}
const MAX_PROJECTS = 32;

/** Construct a catalog implementation using Git and the vendored Prime Agent CLI. */
export const make = (options: WorkspaceCatalogOptions) => Effect.gen(function* () {
  const repositoryPath = resolve(options.repositoryPath);
  const gitPath = options.gitPath ?? "git";
  const nodePath = options.nodePath ?? resolve(repositoryPath, "assets/runtime/node");
  const primeAgentCliPath = options.primeAgentCliPath ?? resolve(repositoryPath, "assets/runtime/prime-agent/dist/bundle/cli.js");
  const environment = options.environment ?? {};
  const projectStorePath = options.projectStorePath;
  const managedWorktreeRoot = resolve(options.managedWorktreeRoot ?? resolve(dirname(projectStorePath ?? repositoryPath), "worktrees"));

  const restoredStore = projectStorePath === undefined ? { paths: [] as string[], worktrees: [] as StoredWorktree[] } : yield* Effect.tryPromise({
    try: () => readFile(projectStorePath, "utf8"), catch: (cause) => projectError("load-projects", "Could not read saved projects", cause),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ProjectStoreJsonSchema)),
    Effect.map((store) => ({ paths: [...store.paths], worktrees: store.version === 2 ? [...store.worktrees] : [] })),
    Effect.catch((error) => {
      const missing = error instanceof WorkspaceCatalogProjectError && error.cause instanceof Error && "code" in error.cause && error.cause.code === "ENOENT";
      return missing ? Effect.succeed({ paths: [] as string[], worktrees: [] as StoredWorktree[] }) : Effect.logWarning(`Ignoring saved project catalog: ${error}`).pipe(Effect.as({ paths: [] as string[], worktrees: [] as StoredWorktree[] }));
    }),
  );
  const initialPaths = [repositoryPath, ...restoredStore.paths].map((path) => resolve(path)).filter((path, index, paths) => paths.indexOf(path) === index).filter((path) => {
    try { return statSync(path).isDirectory(); } catch { return false; }
  }).slice(0, MAX_PROJECTS);
  const projectPaths = yield* Ref.make<readonly string[]>(initialPaths.length > 0 ? initialPaths : [repositoryPath]);
  const storedWorktrees = yield* Ref.make<readonly StoredWorktree[]>(restoredStore.worktrees);
  const state = yield* Ref.make<WorkspaceSnapshot>({ projects: [], worktrees: [], settledWorktrees: [], agents: [], updatedAt: new Date(0).toISOString() });
  const notifications = yield* PubSub.unbounded<WorkspaceCatalogEvent>();
  const mutationMutex = yield* Semaphore.make(1);
  const current = Ref.get(state); const events = Stream.fromPubSub(notifications);

  const discoverWorktrees = (projectPath: string): Effect.Effect<ProjectWorktrees, WorkspaceCatalogCommandError | WorkspaceCatalogParseError> =>
    runCommand(gitPath, ["worktree", "list", "--porcelain", "-z"], projectPath, environment, "git-worktree-list").pipe(
      Effect.flatMap(parseGitWorktrees), Effect.map((records) => ({ projectPath, records })),
      Effect.catch((error) => error instanceof WorkspaceCatalogCommandError && /not a git repository/iu.test(error.message)
        ? Effect.succeed({ projectPath, records: [{ path: projectPath, head: "", branch: null, detached: false, locked: false }] }) : Effect.fail(error)),
    );
  const refreshUnlocked = Effect.fn("WorkspaceCatalog.refreshUnlocked")(function* () {
    const paths = yield* Ref.get(projectPaths);
    const [primeOutput, discovered] = yield* Effect.all([
      runCommand(nodePath, [primeAgentCliPath, "list", "--json"], paths[0] ?? repositoryPath, environment, "prime-agent-list"),
      Effect.forEach(paths, discoverWorktrees, { concurrency: 1 }),
    ], { concurrency: 2 });
    const decoded = yield* Schema.decodeUnknownEffect(PrimeListJsonSchema)(primeOutput).pipe(Effect.mapError((cause) => parseError("prime-agent", "Could not decode prime-agent list JSON", cause)));
    const snapshot = makeSnapshot(discovered, decoded.sessions, yield* Ref.get(storedWorktrees));
    yield* Ref.set(state, snapshot);
    yield* PubSub.publish(notifications, { kind: "snapshot", snapshot } satisfies WorkspaceCatalogEvent).pipe(Effect.asVoid);
    return snapshot;
  })();
  const refresh = mutationMutex.withPermits(1)(refreshUnlocked);

  const persistStore = (paths: readonly string[], worktrees: readonly StoredWorktree[]) => projectStorePath === undefined ? Effect.void : Effect.tryPromise({
    try: async () => {
      const temporary = `${projectStorePath}.${process.pid}.tmp`;
      await mkdir(dirname(projectStorePath), { recursive: true });
      await writeFile(temporary, JSON.stringify({ version: 2, paths, worktrees }, null, 2), "utf8");
      await rename(temporary, projectStorePath);
    }, catch: (cause) => projectError("save-projects", "Could not save workspace catalog", cause),
  });
  const saveRefs = (paths: readonly string[], worktrees: readonly StoredWorktree[]) => persistStore(paths, worktrees).pipe(Effect.andThen(Ref.set(projectPaths, paths)), Effect.andThen(Ref.set(storedWorktrees, worktrees)));

  const addProjectUnlocked = Effect.fn("WorkspaceCatalog.addProject")(function* (path: string) {
    const normalized = yield* Effect.tryPromise({
      try: async () => { const candidate = await realpath(path); if (!statSync(candidate).isDirectory()) throw new Error("Selected path is not a directory"); return candidate; },
      catch: (cause) => projectError("add-project", "Unable to open this folder. Choose a directory that exists and you can access.", cause),
    });
    const paths = yield* Ref.get(projectPaths); if (paths.includes(normalized)) return yield* refreshUnlocked;
    if (paths.length >= MAX_PROJECTS) return yield* projectError("add-project", `Unable to open another folder. A workspace can contain at most ${MAX_PROJECTS} projects.`);
    yield* saveRefs([...paths, normalized], yield* Ref.get(storedWorktrees)); return yield* refreshUnlocked;
  });
  const addProject = (path: string) => mutationMutex.withPermits(1)(addProjectUnlocked(path));

  const archiveProjectUnlocked = Effect.fn("WorkspaceCatalog.archiveProject")(function* (projectId: string) {
    const paths = yield* Ref.get(projectPaths);
    if (projectId === repositoryPath) return yield* projectError("archive-project", "Ernie's primary Space cannot be archived.");
    if (!paths.includes(projectId)) return yield* projectError("archive-project", "This Space is no longer in the workspace catalog.");
    let snapshot = yield* Ref.get(state); if (!snapshot.projects.some((project) => project.id === projectId)) snapshot = yield* refreshUnlocked;
    const nextPaths = paths.filter((path) => path !== projectId);
    const nextStored = yield* Ref.get(storedWorktrees);
    yield* saveRefs(nextPaths, nextStored);
    snapshot = snapshotWithoutProject(snapshot, projectId); yield* Ref.set(state, snapshot);
    yield* PubSub.publish(notifications, { kind: "snapshot", snapshot } satisfies WorkspaceCatalogEvent).pipe(Effect.asVoid);
    return snapshot;
  });
  const archiveProject = (projectId: string) => mutationMutex.withPermits(1)(archiveProjectUnlocked(projectId));

  const createWorktreeUnlocked = Effect.fn("WorkspaceCatalog.createWorktree")(function* (sourceWorktreeId: string, rawBranch: string) {
    const snapshot = yield* refreshUnlocked;
    const project = snapshot.projects.find((candidate) => candidate.worktreeIds.includes(sourceWorktreeId));
    const source = snapshot.worktrees.find((candidate) => candidate.id === sourceWorktreeId);
    if (project === undefined || source === undefined) return yield* worktreeError("unknown_worktree", "This active worktree is no longer authorized.", sourceWorktreeId);
    const branch = rawBranch.trim();
    if (branch.length === 0 || branch.length > 240) return yield* worktreeError("invalid_branch", "Enter a valid branch name.", sourceWorktreeId);
    yield* runCommand(gitPath, ["check-ref-format", "--branch", branch], source.path, environment, "git-check-branch").pipe(
      Effect.mapError((cause) => worktreeError("invalid_branch", "Enter a valid Git branch name.", sourceWorktreeId, cause)),
    );
    yield* Effect.tryPromise({
      try: () => mkdir(managedWorktreeRoot, { recursive: true }),
      catch: (cause) => projectError("create-worktree", "Could not prepare Ernie's worktree directory.", cause),
    });
    const realRoot = yield* Effect.tryPromise({
      try: () => realpath(managedWorktreeRoot),
      catch: (cause) => projectError("create-worktree", "Could not verify Ernie's worktree directory.", cause),
    });
    const repositoryKey = createHash("sha256").update(project.id).digest("hex").slice(0, 10);
    const target = resolve(realRoot, `${basename(project.path)}-${repositoryKey}`, branchSlug(branch));
    if (!containsPath(realRoot, target)) return yield* worktreeError("path_conflict", "The managed worktree path is invalid.", target);

    const exists = yield* runCommandOutput(gitPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], source.path, environment, "git-branch-exists", [0, 1]);
    if (exists.exitCode === 0) {
      const recoverable = snapshot.worktrees.find((candidate) => candidate.id === target && candidate.branch === branch);
      if (recoverable === undefined) return yield* worktreeError("branch_exists", `Branch “${branch}” already exists.`, sourceWorktreeId);
      const canonicalTarget = yield* Effect.tryPromise({
        try: () => realpath(target),
        catch: (cause) => worktreeError("path_conflict", "The existing managed checkout could not be verified.", target, cause),
      });
      if (canonicalTarget !== target || !containsPath(realRoot, canonicalTarget)) return yield* worktreeError("path_conflict", "The existing checkout escapes Ernie's worktree directory.", target);
      const next = upsertStored(yield* Ref.get(storedWorktrees), {
        projectId: project.id, path: canonicalTarget, branch, managed: true, lifecycle: "active", settledAt: null,
      });
      yield* saveRefs(yield* Ref.get(projectPaths), next);
      return { snapshot: yield* refreshUnlocked, worktreeId: canonicalTarget };
    }

    try { statSync(target); return yield* worktreeError("path_conflict", "The managed checkout path already exists.", target); } catch { /* absent */ }
    const parent = dirname(target);
    yield* Effect.tryPromise({ try: () => mkdir(parent, { recursive: true }), catch: (cause) => projectError("create-worktree", "Could not prepare the managed worktree directory.", cause) });
    const realParent = yield* Effect.tryPromise({
      try: () => realpath(parent),
      catch: (cause) => projectError("create-worktree", "Could not verify the managed worktree directory.", cause),
    });
    if (!containsPath(realRoot, realParent)) return yield* worktreeError("path_conflict", "The managed checkout path escapes Ernie's worktree directory.", target);
    const base = bounded(yield* runCommand(gitPath, ["rev-parse", "--verify", "HEAD"], source.path, environment, "git-active-head").pipe(
      Effect.mapError((cause) => worktreeError("no_head", "The active worktree does not have a commit to branch from.", sourceWorktreeId, cause)),
    ), 128);
    yield* runCommand(gitPath, ["worktree", "add", "-b", branch, target, base], source.path, environment, "git-worktree-add");
    const createdPath = yield* Effect.tryPromise({
      try: () => realpath(target),
      catch: (cause) => projectError("create-worktree", "Could not resolve the created checkout.", cause),
    });
    const next = upsertStored(yield* Ref.get(storedWorktrees), { projectId: project.id, path: createdPath, branch, managed: true, lifecycle: "active", settledAt: null });
    yield* saveRefs(yield* Ref.get(projectPaths), next);
    return { snapshot: yield* refreshUnlocked, worktreeId: createdPath };
  });
  const createWorktree = (sourceWorktreeId: string, branch: string) => mutationMutex.withPermits(1)(createWorktreeUnlocked(sourceWorktreeId, branch));

  const archiveWorktreeUnlocked = Effect.fn("WorkspaceCatalog.archiveWorktree")(function* (worktreeId: string) {
    const snapshot = yield* refreshUnlocked;
    const alreadySettled = (snapshot.settledWorktrees ?? []).find((worktree) => worktree.id === worktreeId);
    if (alreadySettled !== undefined) return snapshot;
    const project = snapshot.projects.find((candidate) => candidate.worktreeIds.includes(worktreeId));
    const worktree = snapshot.worktrees.find((candidate) => candidate.id === worktreeId);
    if (project === undefined || worktree === undefined) return yield* worktreeError("unknown_worktree", "This worktree is no longer available.", worktreeId);
    if (project.worktreeIds[0] === worktreeId) return yield* worktreeError("primary_worktree", "A Space's primary checkout cannot be settled.", worktreeId);
    const next = upsertStored(yield* Ref.get(storedWorktrees), { projectId: project.id, path: worktree.path, branch: worktree.branch ?? null, managed: worktree.managed ?? false, lifecycle: "settled", settledAt: new Date().toISOString() });
    yield* saveRefs(yield* Ref.get(projectPaths), next); return yield* refreshUnlocked;
  });
  const archiveWorktree = (worktreeId: string) => mutationMutex.withPermits(1)(archiveWorktreeUnlocked(worktreeId));

  const restoreWorktreeUnlocked = Effect.fn("WorkspaceCatalog.restoreWorktree")(function* (worktreeId: string) {
    const snapshot = yield* refreshUnlocked;
    if (snapshot.worktrees.some((worktree) => worktree.id === worktreeId)) return snapshot;
    const worktree = (snapshot.settledWorktrees ?? []).find((candidate) => candidate.id === worktreeId);
    const project = snapshot.projects.find((candidate) => candidate.id === worktree?.projectId);
    const metadata = (yield* Ref.get(storedWorktrees)).find((entry) => entry.projectId === project?.id && entry.path === worktreeId);
    if (project === undefined || worktree === undefined || metadata === undefined) return yield* worktreeError("unknown_worktree", "This settled worktree is no longer available.", worktreeId);
    if (!worktree.checkoutPresent) {
      if (!metadata.managed || metadata.branch === null) return yield* worktreeError("checkout_missing", "This external checkout is no longer present on disk.", worktreeId);
      yield* Effect.tryPromise({
        try: () => mkdir(managedWorktreeRoot, { recursive: true }),
        catch: (cause) => projectError("restore-worktree", "Could not prepare Ernie's worktree directory.", cause),
      });
      const realRoot = yield* Effect.tryPromise({
        try: () => realpath(managedWorktreeRoot),
        catch: (cause) => projectError("restore-worktree", "Could not verify Ernie's worktree directory.", cause),
      });
      const target = resolve(metadata.path);
      const parent = dirname(target);
      if (!containsPath(realRoot, target)) return yield* worktreeError("not_managed", "The saved checkout path is outside Ernie's managed worktree directory.", worktreeId);
      const realParent = yield* Effect.tryPromise({
        try: () => realpath(parent),
        catch: (cause) => worktreeError("checkout_missing", "The managed checkout parent directory is no longer available.", worktreeId, cause),
      });
      if (!containsPath(realRoot, realParent)) return yield* worktreeError("not_managed", "The saved checkout path escapes Ernie's managed worktree directory.", worktreeId);
      const sourceId = project.worktreeIds[0]; const source = snapshot.worktrees.find((candidate) => candidate.id === sourceId);
      if (source === undefined) return yield* worktreeError("checkout_missing", "Restore the Space's primary checkout first.", worktreeId);
      yield* runCommand(gitPath, ["worktree", "add", metadata.path, metadata.branch], source.path, environment, "git-worktree-restore");
    }
    const next = upsertStored(yield* Ref.get(storedWorktrees), { ...metadata, lifecycle: "active", settledAt: null });
    yield* saveRefs(yield* Ref.get(projectPaths), next); return yield* refreshUnlocked;
  });
  const restoreWorktree = (worktreeId: string) => mutationMutex.withPermits(1)(restoreWorktreeUnlocked(worktreeId));

  const removeWorktreeCheckoutUnlocked = Effect.fn("WorkspaceCatalog.removeWorktreeCheckout")(function* (worktreeId: string) {
    const snapshot = yield* refreshUnlocked;
    const worktree = (snapshot.settledWorktrees ?? []).find((candidate) => candidate.id === worktreeId);
    const project = snapshot.projects.find((candidate) => candidate.id === worktree?.projectId);
    if (project === undefined || worktree === undefined) return yield* worktreeError("not_settled", "Settle this worktree before removing its checkout.", worktreeId);
    if (!worktree.managed) return yield* worktreeError("not_managed", "Ernie can only remove checkouts it created.", worktreeId);
    if (!worktree.checkoutPresent) return snapshot;
    if (worktree.locked) return yield* worktreeError("locked_worktree", "Unlock this Git worktree before removing its checkout.", worktreeId);
    const realRoot = yield* Effect.tryPromise({ try: () => realpath(managedWorktreeRoot), catch: (cause) => projectError("remove-worktree", "Could not verify Ernie's worktree directory.", cause) });
    const realCheckout = yield* Effect.tryPromise({ try: () => realpath(worktree.path), catch: (cause) => worktreeError("checkout_missing", "The checkout is no longer present.", worktreeId, cause) });
    if (!containsPath(realRoot, realCheckout)) return yield* worktreeError("not_managed", "The checkout is outside Ernie's managed worktree directory.", worktreeId);
    const dirty = yield* runCommand(gitPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], worktree.path, environment, "git-worktree-status");
    if (dirty.length > 0) return yield* worktreeError("dirty_worktree", "Commit, stash, or discard this checkout's changes before removing it.", worktreeId);
    const sourceId = project.worktreeIds[0]; const source = snapshot.worktrees.find((candidate) => candidate.id === sourceId);
    if (source === undefined) return yield* worktreeError("checkout_missing", "The Space's primary checkout is unavailable.", worktreeId);
    yield* runCommand(gitPath, ["worktree", "remove", worktree.path], source.path, environment, "git-worktree-remove");
    return yield* refreshUnlocked;
  });
  const removeWorktreeCheckout = (worktreeId: string) => mutationMutex.withPermits(1)(removeWorktreeCheckoutUnlocked(worktreeId));

  const interval = options.refreshIntervalMs ?? 2_000;
  const start = interval === false ? refresh.pipe(Effect.asVoid) : Effect.forever(refresh.pipe(
    Effect.catch((error) => PubSub.publish(notifications, { kind: "error", message: "Unable to refresh the workspace." } satisfies WorkspaceCatalogEvent).pipe(Effect.andThen(Effect.logWarning(`Workspace catalog refresh failed: ${error.message}`)))),
    Effect.andThen(Effect.sleep(interval)),
  ));
  return WorkspaceCatalog.of({ current, events, start, refresh, addProject, archiveProject, createWorktree, archiveWorktree, restoreWorktree, removeWorktreeCheckout });
});
export const layer = (options: WorkspaceCatalogOptions) => Layer.effect(WorkspaceCatalog, make(options));

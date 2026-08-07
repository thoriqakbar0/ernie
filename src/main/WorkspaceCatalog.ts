import { execFile } from "node:child_process";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { AgentStatus, WorkspaceAgent, WorkspaceCatalogEvent, WorkspaceSnapshot, WorkspaceWorktree } from "../shared/workspace";

const DiagnosticSchema = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  severity: Schema.optionalKey(Schema.String),
  level: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
});

const PrimeSessionSchema = Schema.Struct({
  id: Schema.String,
  lifecycle: Schema.Literals(["draft", "live", "archived"]),
  activity: Schema.Literals(["working", "idle"]),
  isSessionActive: Schema.Boolean,
  activeSessionId: Schema.optionalKey(Schema.String),
  sessionId: Schema.String,
  sessionName: Schema.optionalKey(Schema.String),
  cwd: Schema.String,
  isStreaming: Schema.Boolean,
  created: Schema.optionalKey(Schema.String),
  modified: Schema.optionalKey(Schema.String),
  lastActivityAt: Schema.optionalKey(Schema.String),
  firstMessage: Schema.optionalKey(Schema.String),
  runtimeKind: Schema.optionalKey(Schema.Literals(["top-level", "subagent"])),
  parentActiveSessionId: Schema.optionalKey(Schema.String),
  parentSessionId: Schema.optionalKey(Schema.String),
  rlmChildId: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  answerPreview: Schema.optionalKey(Schema.String),
  taskState: Schema.optionalKey(Schema.Literals(["needs_input", "completed"])),
  workerState: Schema.optionalKey(Schema.Literals(["starting", "ready", "recovering", "failed"])),
  diagnostics: Schema.optionalKey(Schema.Array(DiagnosticSchema)),
});
type PrimeSession = typeof PrimeSessionSchema.Type;

const PrimeListSchema = Schema.Struct({ sessions: Schema.Array(PrimeSessionSchema) });
const PrimeListJsonSchema = Schema.fromJsonString(PrimeListSchema);

interface GitWorktreeRecord {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly locked: boolean;
}

/** Configuration for the read-only catalog and its external executables. */
export interface WorkspaceCatalogOptions {
  /** Any checkout in the repository whose worktrees should be cataloged. */
  readonly repositoryPath: string;
  /** Git executable override, primarily for hermetic tests. */
  readonly gitPath?: string;
  /** Node executable used to run the vendored Prime Agent CLI. */
  readonly nodePath?: string;
  /** Vendored Prime Agent CLI JavaScript entry point. */
  readonly primeAgentCliPath?: string;
  /** Poll interval in milliseconds; defaults to 2 seconds. Set to false to refresh only once on start. */
  readonly refreshIntervalMs?: number | false;
  /** Environment additions passed to both read-only commands. */
  readonly environment?: Readonly<Record<string, string>>;
}

/** Failure to execute one of the catalog's read-only external commands. */
export class WorkspaceCatalogCommandError extends Schema.TaggedErrorClass<WorkspaceCatalogCommandError>()(
  "WorkspaceCatalogCommandError",
  { operation: Schema.String, message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

/** Failure to decode Git porcelain or the Prime Agent JSON boundary. */
export class WorkspaceCatalogParseError extends Schema.TaggedErrorClass<WorkspaceCatalogParseError>()(
  "WorkspaceCatalogParseError",
  { source: Schema.Literals(["git", "prime-agent"]), message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

/** Expected failures exposed by catalog refresh and start. */
export type WorkspaceCatalogError = WorkspaceCatalogCommandError | WorkspaceCatalogParseError;

/** Stateful read-only catalog of repository worktrees and Prime Agent sessions. */
export class WorkspaceCatalog extends Context.Service<WorkspaceCatalog, {
  /** The last complete snapshot. */
  readonly current: Effect.Effect<WorkspaceSnapshot>;
  /** Snapshot notifications published after successful refreshes. */
  readonly events: Stream.Stream<WorkspaceCatalogEvent>;
  /** Refresh once, then continue polling until interrupted when polling is enabled. */
  readonly start: Effect.Effect<void, WorkspaceCatalogError>;
  /** Atomically read both external catalogs and publish their joined projection. */
  readonly refresh: Effect.Effect<WorkspaceSnapshot, WorkspaceCatalogError>;
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

function runCommand(
  executable: string,
  args: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string>>,
  operation: string,
): Effect.Effect<string, WorkspaceCatalogCommandError> {
  return Effect.callback<string, WorkspaceCatalogCommandError>((resume) => {
    const child = execFile(executable, args, {
      cwd,
      env: { ...process.env, ...environment },
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    }, (cause, stdout, stderr) => {
      if (cause === null) {
        resume(Effect.succeed(stdout));
        return;
      }
      const detail = bounded(stderr, 4_096);
      resume(Effect.fail(commandError(operation, detail.length > 0 ? detail : bounded(cause.message, 1_024), cause)));
    });
    return Effect.sync(() => child.kill());
  });
}

function parseGitWorktrees(output: string): Effect.Effect<readonly GitWorktreeRecord[], WorkspaceCatalogParseError> {
  return Effect.try({
    try: () => output.split(/\r?\n\r?\n/u).filter((record) => record.trim().length > 0).map((record) => {
      let path: string | undefined;
      let head: string | undefined;
      let branch: string | null = null;
      let detached = false;
      let locked = false;
      for (const line of record.split(/\r?\n/u)) {
        const separator = line.indexOf(" ");
        const key = separator < 0 ? line : line.slice(0, separator);
        const value = separator < 0 ? "" : line.slice(separator + 1);
        if (key === "worktree") path = resolve(value);
        else if (key === "HEAD") head = value;
        else if (key === "branch") branch = value.replace(/^refs\/heads\//u, "");
        else if (key === "detached") detached = true;
        else if (key === "locked") locked = true;
      }
      if (path === undefined || head === undefined) throw new Error("A Git worktree record omitted worktree or HEAD");
      return { path, head, branch, detached, locked };
    }),
    catch: (cause) => parseError("git", "Could not decode git worktree porcelain output", cause),
  });
}

function containsPath(worktreePath: string, candidatePath: string): boolean {
  const child = relative(worktreePath, candidatePath);
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

function makeSnapshot(
  repositoryPath: string,
  records: readonly GitWorktreeRecord[],
  sessions: readonly PrimeSession[],
): WorkspaceSnapshot {
  const byLongestPath = [...records].sort((left, right) => right.path.length - left.path.length);
  const located = sessions.flatMap((session) => {
    const cwd = resolve(session.cwd);
    const worktree = byLongestPath.find((candidate) => containsPath(candidate.path, cwd));
    return worktree === undefined ? [] : [{ session, worktreeId: worktree.path }];
  });
  const idBySession = new Map(located.map(({ session }) => [session.sessionId, session.activeSessionId ?? session.sessionId]));
  const worktreeByAgent = new Map(located.map(({ session, worktreeId }) => [session.activeSessionId ?? session.sessionId, worktreeId]));
  const agents: WorkspaceAgent[] = located.map(({ session, worktreeId }) => {
    const parentAgentId = session.parentActiveSessionId ?? (session.parentSessionId === undefined ? undefined : idBySession.get(session.parentSessionId) ?? session.parentSessionId);
    const name = bounded(session.sessionName || session.firstMessage || (session.runtimeKind === "subagent" ? "Subagent" : "Agent"), 120);
    return {
      id: session.activeSessionId ?? session.sessionId,
      ...(session.activeSessionId === undefined ? {} : { activeSessionId: session.activeSessionId }),
      sessionId: session.sessionId,
      worktreeId,
      ...(parentAgentId === undefined ? {} : { parentAgentId }),
      ...(session.rlmChildId === undefined ? {} : { childId: session.rlmChildId }),
      name,
      summary: bounded(session.summary ?? "", 1_000),
      status: agentStatus(session),
      runtimeKind: session.runtimeKind === "subagent" ? "subagent" : "root",
      ...(session.lastActivityAt === undefined ? {} : { lastActivityAt: session.lastActivityAt }),
      ...(session.answerPreview === undefined ? {} : { answerPreview: bounded(session.answerPreview, 4_000) }),
    };
  });
  const parentByWorktree = new Map<string, string>();
  for (const agent of agents) {
    if (agent.parentAgentId === undefined) continue;
    const parentWorktreeId = worktreeByAgent.get(agent.parentAgentId);
    if (parentWorktreeId !== undefined && parentWorktreeId !== agent.worktreeId && !parentByWorktree.has(agent.worktreeId)) {
      parentByWorktree.set(agent.worktreeId, parentWorktreeId);
    }
  }
  const worktrees: WorkspaceWorktree[] = records.map((record) => {
    const parentWorktreeId = parentByWorktree.get(record.path);
    return {
      id: record.path,
      path: record.path,
      label: record.branch ?? basename(record.path),
      ...(parentWorktreeId === undefined ? {} : { parentWorktreeId }),
    };
  });
  return { worktrees, agents, updatedAt: new Date().toISOString() };
}

/** Construct a catalog implementation using Git and the vendored Prime Agent CLI. */
export const make = (options: WorkspaceCatalogOptions) => Effect.gen(function* () {
  const repositoryPath = resolve(options.repositoryPath);
  const gitPath = options.gitPath ?? "git";
  const nodePath = options.nodePath ?? resolve(repositoryPath, "assets/runtime/node");
  const primeAgentCliPath = options.primeAgentCliPath ?? resolve(repositoryPath, "assets/runtime/prime-agent/dist/bundle/cli.js");
  const environment = options.environment ?? {};
  const state = yield* Ref.make<WorkspaceSnapshot>({ worktrees: [], agents: [], updatedAt: new Date(0).toISOString() });
  const notifications = yield* PubSub.unbounded<WorkspaceCatalogEvent>();
  const current = Ref.get(state);
  const events = Stream.fromPubSub(notifications);

  const refresh = Effect.fn("WorkspaceCatalog.refresh")(function* () {
    const [gitOutput, primeOutput] = yield* Effect.all([
      runCommand(gitPath, ["worktree", "list", "--porcelain"], repositoryPath, environment, "git-worktree-list"),
      runCommand(nodePath, [primeAgentCliPath, "list", "--json"], repositoryPath, environment, "prime-agent-list"),
    ], { concurrency: "unbounded" });
    const records = yield* parseGitWorktrees(gitOutput);
    const decoded = yield* Schema.decodeUnknownEffect(PrimeListJsonSchema)(primeOutput).pipe(
      Effect.mapError((cause) => parseError("prime-agent", "Could not decode prime-agent list JSON", cause)),
    );
    const snapshot = makeSnapshot(repositoryPath, records, decoded.sessions);
    yield* Ref.set(state, snapshot);
    yield* PubSub.publish(notifications, { kind: "snapshot", snapshot } satisfies WorkspaceCatalogEvent).pipe(Effect.asVoid);
    return snapshot;
  })();

  const interval = options.refreshIntervalMs ?? 2_000;
  const start = interval === false
    ? refresh.pipe(Effect.asVoid)
    : Effect.forever(
      refresh.pipe(
        Effect.catch((error) => PubSub.publish(notifications, {
          kind: "error",
          message: "Unable to refresh the workspace.",
        } satisfies WorkspaceCatalogEvent).pipe(
          Effect.andThen(Effect.logWarning(`Workspace catalog refresh failed: ${error.message}`)),
        )),
        Effect.andThen(Effect.sleep(interval)),
      ),
    );

  return WorkspaceCatalog.of({ current, events, start, refresh });
});

/** Dependency-preserving WorkspaceCatalog layer. */
export const layer = (options: WorkspaceCatalogOptions) => Layer.effect(WorkspaceCatalog, make(options));

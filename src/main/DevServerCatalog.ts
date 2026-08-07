import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import type { DevServer, DevServerCatalogEvent, DevServerSnapshot } from "../shared/devServer";

const LISTENER_LSOF_ARGS = ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"] as const;
const DEFAULT_COMMON_PORTS = [3000, 3001, 4173, 4200, 5173, 5174, 8000, 8080, 8787] as const;
const MAX_KNOWN_PORTS = 32;
const MAX_LSOF_OUTPUT_BYTES = 1024 * 1024;

/** Configuration for safe, read-only local development-server discovery. */
export interface DevServerCatalogOptions {
  /** lsof executable override, primarily for hermetic tests. */
  readonly lsofPath?: string;
  /** Bounded allowlist of ports that may be reported. */
  readonly commonPorts?: readonly number[];
  /** Platform override, primarily for tests. */
  readonly platform?: NodeJS.Platform;
}

/** The host platform cannot safely use this catalog implementation. */
export class DevServerUnsupportedPlatformError extends Schema.TaggedErrorClass<DevServerUnsupportedPlatformError>()(
  "DevServerUnsupportedPlatformError",
  { platform: Schema.String, message: Schema.String },
) {}

/** The fixed-argument lsof discovery command could not complete. */
export class DevServerCommandError extends Schema.TaggedErrorClass<DevServerCommandError>()(
  "DevServerCommandError",
  { message: Schema.String },
) {}

/** lsof returned an unsafe or undecodable record. */
export class DevServerParseError extends Schema.TaggedErrorClass<DevServerParseError>()(
  "DevServerParseError",
  { message: Schema.String },
) {}

/** Catalog configuration or worktree scope violated the discovery contract. */
export class DevServerConfigurationError extends Schema.TaggedErrorClass<DevServerConfigurationError>()(
  "DevServerConfigurationError",
  { message: Schema.String },
) {}

/** Expected failures exposed by development-server discovery. */
export type DevServerCatalogError =
  | DevServerUnsupportedPlatformError
  | DevServerCommandError
  | DevServerParseError
  | DevServerConfigurationError;

/** Demand-driven, read-only catalog of loopback development servers. */
export class DevServerCatalog extends Context.Service<DevServerCatalog, {
  /** Last complete snapshot; initially revision zero with no servers. */
  readonly current: Effect.Effect<DevServerSnapshot>;
  /** Snapshot and renderer-safe failure notifications. */
  readonly events: Stream.Stream<DevServerCatalogEvent>;
  /** Discover listeners scoped to `worktreePath` and atomically publish a new snapshot. */
  readonly refresh: (worktreePath: string) => Effect.Effect<DevServerSnapshot, DevServerCatalogError>;
}>()("@ernie/main/DevServerCatalog") {}

interface CommandResult {
  readonly stdout: string;
}

interface ListenerRecord {
  readonly pid: string;
  readonly host: "127.0.0.1" | "[::1]";
  readonly port: number;
}

function runLsof(executable: string, args: readonly string[]): Effect.Effect<CommandResult, DevServerCommandError> {
  return Effect.callback((resume) => {
    const child = execFile(executable, args, {
      encoding: "utf8",
      maxBuffer: MAX_LSOF_OUTPUT_BYTES,
      windowsHide: true,
    }, (cause, stdout) => {
      if (cause === null) {
        resume(Effect.succeed({ stdout }));
        return;
      }
      // lsof uses exit status 1 when its selection has no matches. This is also
      // expected if a process exits between listener and cwd discovery.
      if (cause.code === 1 && stdout.length === 0) {
        resume(Effect.succeed({ stdout: "" }));
        return;
      }
      resume(Effect.fail(new DevServerCommandError({ message: "Local listener discovery failed" })));
    });
    return Effect.sync(() => child.kill());
  });
}

function parsePort(value: string): number | null {
  if (!/^[0-9]{1,5}$/u.test(value)) return null;
  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : null;
}

function parseListeners(output: string): Effect.Effect<readonly ListenerRecord[], DevServerParseError> {
  return Effect.try({
    try: () => {
      const records: ListenerRecord[] = [];
      let pid: string | null = null;
      for (const line of output.split(/\r?\n/u)) {
        if (line.startsWith("p")) {
          const candidate = line.slice(1);
          if (!/^[1-9][0-9]*$/u.test(candidate) || !Number.isSafeInteger(Number(candidate))) {
            throw new Error("invalid process identifier");
          }
          pid = candidate;
          continue;
        }
        if (!line.startsWith("n") || pid === null) continue;
        const endpoint = line.slice(1).replace(/ \(LISTEN\)$/u, "");
        const match = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]|\[::\]):([0-9]+)$/u.exec(endpoint);
        if (match === null) continue;
        const rawHost = match[1];
        const rawPort = match[2];
        if (rawHost === undefined || rawPort === undefined) throw new Error("listener omitted its address");
        const port = parsePort(rawPort);
        if (port === null) throw new Error("listener contained an invalid port");
        records.push({ pid, host: rawHost.startsWith("[") ? "[::1]" : "127.0.0.1", port });
      }
      return records;
    },
    catch: () => new DevServerParseError({ message: "Could not decode local listener discovery output" }),
  });
}

function parseCwd(output: string): Effect.Effect<string | null, DevServerParseError> {
  return Effect.try({
    try: () => {
      const paths = output.split(/\r?\n/u).filter((line) => line.startsWith("n")).map((line) => line.slice(1));
      if (paths.length === 0) return null;
      if (paths.length !== 1 || paths[0] === undefined || paths[0].length === 0 || paths[0].includes("\0")) {
        throw new Error("invalid cwd record");
      }
      return paths[0];
    },
    catch: () => new DevServerParseError({ message: "Could not decode local process scope" }),
  });
}

function configuredPorts(options: DevServerCatalogOptions): Effect.Effect<ReadonlySet<number>, DevServerConfigurationError> {
  const values = options.commonPorts ?? DEFAULT_COMMON_PORTS;
  if (values.length > MAX_KNOWN_PORTS) {
    return Effect.fail(new DevServerConfigurationError({ message: `Development-server discovery is limited to ${MAX_KNOWN_PORTS} known ports` }));
  }
  const ports = new Set(values);
  if ([...ports].some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65_535)) {
    return Effect.fail(new DevServerConfigurationError({ message: "Known ports must be TCP ports from 1 through 65535" }));
  }
  return Effect.succeed(ports);
}

function canonicalWorktree(path: string): Effect.Effect<string, DevServerConfigurationError> {
  if (path.length === 0) {
    return Effect.fail(new DevServerConfigurationError({ message: "A worktree path is required for development-server discovery" }));
  }
  return Effect.tryPromise({
    try: () => realpath(path),
    catch: () => new DevServerConfigurationError({ message: "Development-server worktree scope could not be established" }),
  });
}

function canonicalProcessCwd(path: string): Effect.Effect<string | null> {
  return Effect.promise(() => realpath(path).catch(() => null));
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function projectServer(listener: Pick<ListenerRecord, "host" | "port">): DevServer {
  return { port: listener.port, url: `http://${listener.host}:${listener.port}` };
}

/** Construct a serialized, demand-driven catalog backed by worktree-scoped lsof discovery. */
export const make = (options: DevServerCatalogOptions = {}) => Effect.gen(function* () {
  const platform = options.platform ?? process.platform;
  const initial: DevServerSnapshot = { revision: 0, updatedAt: new Date(0).toISOString(), servers: [] };
  const state = yield* Ref.make(initial);
  const notifications = yield* PubSub.unbounded<DevServerCatalogEvent>();
  const refreshLock = yield* Semaphore.make(1);

  const discover = (worktreePath: string): Effect.Effect<readonly DevServer[], DevServerCatalogError> => Effect.gen(function* () {
    if (platform !== "darwin" && platform !== "linux") {
      return yield* new DevServerUnsupportedPlatformError({
        platform,
        message: "Local development-server discovery supports macOS and Linux",
      });
    }
    const allowedPorts = yield* configuredPorts(options);
    const worktree = yield* canonicalWorktree(worktreePath);
    const executable = options.lsofPath ?? (platform === "darwin" ? "/usr/sbin/lsof" : "lsof");
    const listeners = yield* runLsof(executable, LISTENER_LSOF_ARGS).pipe(
      Effect.flatMap(({ stdout }) => parseListeners(stdout)),
    );
    const relevant = listeners.filter(({ port }) => allowedPorts.has(port));
    const pids = [...new Set(relevant.map(({ pid }) => pid))];
    const scopedPids = new Set(yield* Effect.forEach(pids, (pid) => Effect.gen(function* () {
      const result = yield* runLsof(executable, ["-a", "-p", pid, "-d", "cwd", "-F", "n"]);
      const cwd = yield* parseCwd(result.stdout);
      if (cwd === null) return null;
      const canonical = yield* canonicalProcessCwd(cwd);
      return canonical !== null && isWithin(worktree, canonical) ? pid : null;
    }), { concurrency: 8 }).pipe(
      Effect.map((values) => values.filter((pid): pid is string => pid !== null)),
    ));
    const unique = new Map<string, DevServer>();
    for (const listener of relevant.filter(({ pid }) => scopedPids.has(pid))) {
      const server = projectServer(listener);
      unique.set(server.url, server);
    }
    return [...unique.values()].sort((left, right) => left.port - right.port || left.url.localeCompare(right.url));
  });

  const refresh = (worktreePath: string) => refreshLock.withPermits(1)(Effect.gen(function* () {
    const servers = yield* discover(worktreePath);
    const snapshot = yield* Ref.updateAndGet(state, (previous): DevServerSnapshot => ({
      revision: previous.revision + 1,
      updatedAt: new Date().toISOString(),
      servers,
    }));
    yield* PubSub.publish(notifications, { kind: "snapshot", snapshot }).pipe(Effect.asVoid);
    return snapshot;
  }).pipe(
    Effect.tapError(() => PubSub.publish(notifications, {
      kind: "error", code: "discovery_failed", message: "Unable to discover local development servers.",
    }).pipe(Effect.asVoid)),
  ));

  return DevServerCatalog.of({ current: Ref.get(state), events: Stream.fromPubSub(notifications), refresh });
});

/** Dependency-preserving DevServerCatalog layer. */
export const layer = (options: DevServerCatalogOptions = {}) => Layer.effect(DevServerCatalog, make(options));

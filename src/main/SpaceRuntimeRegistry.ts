import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type { AgentCommand, AgentState } from "../shared/contract";
import type { AgentSlashCommand } from "../shared/commands";
import type { AgentModelOption, SpaceAgentEvent, SpaceRuntimeState, StartSpaceInput } from "../shared/spaceRuntime";
import type { WorkspaceSnapshot } from "../shared/workspace";
import { type Options as PrimeAgentRpcOptions, type PrimeAgentRpcError, type PrimeAgentRpcInstance, make as makePrimeAgentRpc } from "./PrimeAgentRpc";
import { WorkspaceCatalog } from "./WorkspaceCatalog";

const DEFAULT_MAX_RESIDENT = 3;

/** Expected registry failures safe to project across IPC. */
export class SpaceRuntimeRegistryError extends Schema.TaggedErrorClass<SpaceRuntimeRegistryError>()(
  "SpaceRuntimeRegistryError",
  { reason: Schema.Literals(["unknown_space", "capacity"]), message: Schema.String, spaceId: Schema.String },
) {}

interface ResidentRuntime {
  readonly runtime: PrimeAgentRpcInstance;
  readonly scope: Scope.Closeable;
  readonly cwd: string;
  readonly lastUsed: number;
  readonly inFlight: number;
  readonly rlmMaxDepth: number;
}

/** Injectable runtime factory used by the registry's production and test seams. */
export interface SpaceRuntimeFactory {
  readonly open: (cwd: string, rlmMaxDepth: number, scope: Scope.Closeable) => Effect.Effect<PrimeAgentRpcInstance>;
}

/** Construction ports for the public registry seam. */
export interface SpaceRuntimeRegistryOptions {
  readonly snapshot: Effect.Effect<WorkspaceSnapshot>;
  readonly runtimeFactory: SpaceRuntimeFactory;
  readonly maxResident?: number;
}

/** Space-scoped runtime ownership, authorization, capacity, and event multiplexing. */
export class SpaceRuntimeRegistry extends Context.Service<SpaceRuntimeRegistry, {
  readonly events: Stream.Stream<SpaceAgentEvent>;
  readonly state: (spaceId: string) => Effect.Effect<SpaceRuntimeState, SpaceRuntimeRegistryError | PrimeAgentRpcError>;
  readonly availableCommands: (spaceId: string) => Effect.Effect<readonly AgentSlashCommand[], SpaceRuntimeRegistryError | PrimeAgentRpcError>;
  readonly availableModels: (spaceId: string) => Effect.Effect<readonly AgentModelOption[], SpaceRuntimeRegistryError | PrimeAgentRpcError>;
  readonly getRlmMaxDepth: (spaceId: string) => Effect.Effect<number, SpaceRuntimeRegistryError | PrimeAgentRpcError>;
  readonly command: (spaceId: string, command: AgentCommand) => Effect.Effect<{ readonly cancelled?: boolean }, SpaceRuntimeRegistryError | PrimeAgentRpcError>;
  readonly startSpace: (input: StartSpaceInput) => Effect.Effect<void, SpaceRuntimeRegistryError | PrimeAgentRpcError>;
  /** Stop and forget one owned runtime without affecting saved Prime Agent sessions. */
  readonly closeSpace: (spaceId: string) => Effect.Effect<void>;
  readonly close: Effect.Effect<void>;
}>()("@ernie/main/SpaceRuntimeRegistry") {}

function cwdForSpace(snapshot: WorkspaceSnapshot, spaceId: string): string | undefined {
  const project = snapshot.projects.find((candidate) => candidate.id === spaceId);
  if (project !== undefined) return project.path;
  const authorizedWorktreeIds = new Set(snapshot.projects.flatMap((candidate) => candidate.worktreeIds));
  if (!authorizedWorktreeIds.has(spaceId)) return undefined;
  return snapshot.worktrees.find((candidate) => candidate.id === spaceId)?.path;
}

function isIdle(state: AgentState, entry: ResidentRuntime): boolean {
  return entry.inFlight === 0
    && state.connection === "ready"
    && !state.isStreaming
    && !state.isCompacting
    && state.queuedCount === 0
    && state.switchingExecutionTo === undefined;
}

/** Builds a scoped registry. Every dynamic runtime receives its own closeable child scope. */
export const make = (options: SpaceRuntimeRegistryOptions) => Effect.gen(function* () {
  const residents = yield* Ref.make<ReadonlyMap<string, ResidentRuntime>>(new Map());
  const clock = yield* Ref.make(0);
  const notifications = yield* PubSub.bounded<SpaceAgentEvent>(512);
  const mutex = yield* Semaphore.make(1);
  const maxResident = options.maxResident ?? DEFAULT_MAX_RESIDENT;

  const closeEntry = (entry: ResidentRuntime) => entry.runtime.stop.pipe(
    Effect.ignore,
    Effect.andThen(Scope.close(entry.scope, Exit.void)),
  );

  const claim = (spaceId: string, requestedDepth?: number) => mutex.withPermits(1)(Effect.gen(function* () {
    const snapshot = yield* options.snapshot;
    const cwd = cwdForSpace(snapshot, spaceId);
    if (cwd === undefined) return yield* new SpaceRuntimeRegistryError({ reason: "unknown_space", spaceId, message: "This Space is no longer in the workspace catalog." });
    const tick = yield* Ref.updateAndGet(clock, (value) => value + 1);
    const current = yield* Ref.get(residents);
    const existing = current.get(spaceId);
    let next = current;
    if (existing !== undefined && (requestedDepth === undefined || requestedDepth === existing.rlmMaxDepth)) {
      const claimed = { ...existing, lastUsed: tick, inFlight: existing.inFlight + 1 };
      yield* Ref.set(residents, new Map(current).set(spaceId, claimed));
      return claimed.runtime;
    }
    if (existing !== undefined) {
      const runtimeState = yield* existing.runtime.state;
      if (!isIdle(runtimeState, existing)) {
        return yield* new SpaceRuntimeRegistryError({ reason: "capacity", spaceId, message: "RLM depth cannot change while this Space is busy." });
      }
      yield* closeEntry(existing);
      const withoutExisting = new Map(current);
      withoutExisting.delete(spaceId);
      next = withoutExisting;
    }

    if (next.size >= maxResident) {
      const candidates = yield* Effect.forEach(next, ([id, entry]) => entry.runtime.state.pipe(
        Effect.map((state) => ({ id, entry, idle: isIdle(state, entry) })),
      ));
      const victim = candidates.filter((candidate) => candidate.idle).sort((a, b) => a.entry.lastUsed - b.entry.lastUsed)[0];
      if (victim === undefined) return yield* new SpaceRuntimeRegistryError({ reason: "capacity", spaceId, message: `All ${maxResident} resident Space runtimes are busy. Try again when one is idle.` });
      yield* closeEntry(victim.entry);
      const remaining = new Map(current);
      remaining.delete(victim.id);
      next = remaining;
    }

    const effectiveDepth = requestedDepth ?? 0;
    const scope = yield* Scope.make();
    const runtime = yield* options.runtimeFactory.open(cwd, effectiveDepth, scope).pipe(
      Effect.onError(() => Scope.close(scope, Exit.void)),
    );
    yield* Effect.forkIn(Stream.runForEach(runtime.events, (event) => PubSub.publish(notifications, { spaceId, event }).pipe(Effect.asVoid)), scope);
    yield* runtime.start.pipe(Effect.onError(() => Scope.close(scope, Exit.void)));
    const created: ResidentRuntime = { runtime, scope, cwd, lastUsed: tick, inFlight: 1, rlmMaxDepth: effectiveDepth };
    yield* Ref.set(residents, new Map(next).set(spaceId, created));
    return runtime;
  }));

  const release = (spaceId: string) => mutex.withPermits(1)(Ref.update(residents, (current) => {
    const entry = current.get(spaceId);
    if (entry === undefined) return current;
    return new Map(current).set(spaceId, { ...entry, inFlight: Math.max(0, entry.inFlight - 1) });
  }));

  const withRuntime = <A, E>(spaceId: string, use: (runtime: PrimeAgentRpcInstance) => Effect.Effect<A, E>): Effect.Effect<A, E | SpaceRuntimeRegistryError | PrimeAgentRpcError> =>
    Effect.acquireUseRelease(claim(spaceId), use, () => release(spaceId));
  const withRuntimeAtDepth = <A, E>(spaceId: string, rlmMaxDepth: number, use: (runtime: PrimeAgentRpcInstance) => Effect.Effect<A, E>): Effect.Effect<A, E | SpaceRuntimeRegistryError | PrimeAgentRpcError> =>
    Effect.acquireUseRelease(claim(spaceId, rlmMaxDepth), use, () => release(spaceId));

  const state = (spaceId: string) => withRuntime(spaceId, (runtime) => Effect.gen(function* () {
    const agent = yield* runtime.state;
    const entry = (yield* Ref.get(residents)).get(spaceId);
    return { spaceId, agent, rlmMaxDepth: entry?.rlmMaxDepth ?? 0 } satisfies SpaceRuntimeState;
  }));

  const availableCommands = (spaceId: string) => withRuntime(spaceId, (runtime) => runtime.availableCommands);
  const availableModels = (spaceId: string) => withRuntime(spaceId, (runtime) => runtime.availableModels.pipe(
    Effect.map((models) => models.map((model) => ({
      id: model.id,
      label: model.name || model.id,
      provider: model.provider,
      thinkingLevels: model.thinkingLevels,
    }))),
  ));
  const getRlmMaxDepth = (spaceId: string) => withRuntime(spaceId, () => Effect.gen(function* () {
    return (yield* Ref.get(residents)).get(spaceId)?.rlmMaxDepth ?? 0;
  }));
  const command = (spaceId: string, command: AgentCommand) => withRuntime(spaceId, (runtime) => runtime.command(command));
  const startSpace = (input: StartSpaceInput) => withRuntimeAtDepth(input.spaceId, input.rlmMaxDepth, (runtime) => runtime.configureThenPrompt({
    message: input.prompt,
    model: input.model,
    thinkingLevel: input.thinkingLevel,
  }).pipe(
    Effect.tap(() => Ref.update(residents, (current) => {
      const entry = current.get(input.spaceId);
      return entry === undefined ? current : new Map(current).set(input.spaceId, { ...entry, rlmMaxDepth: input.rlmMaxDepth });
    })),
  ));

  const closeSpace = (spaceId: string) => mutex.withPermits(1)(Effect.gen(function* () {
    const current = yield* Ref.get(residents);
    const entry = current.get(spaceId);
    if (entry === undefined) return;
    const next = new Map(current);
    next.delete(spaceId);
    yield* Ref.set(residents, next);
    yield* closeEntry(entry);
  }));

  const close = mutex.withPermits(1)(Effect.gen(function* () {
    const current = yield* Ref.getAndSet(residents, new Map());
    yield* Effect.forEach(current.values(), closeEntry, { discard: true });
  }));
  yield* Effect.addFinalizer(() => close);

  return SpaceRuntimeRegistry.of({ events: Stream.fromPubSub(notifications), state, availableCommands, availableModels, getRlmMaxDepth, command, startSpace, closeSpace, close });
});

/** Production registry layer deriving each runtime cwd exclusively from WorkspaceCatalog. */
export const layer = (options: Omit<PrimeAgentRpcOptions, "projectPath"> & { readonly maxResident?: number }) => Layer.effect(
  SpaceRuntimeRegistry,
  Effect.gen(function* () {
    const catalog = yield* WorkspaceCatalog;
    return yield* make({
      snapshot: catalog.current,
      runtimeFactory: {
        open: (cwd, rlmMaxDepth, scope) => Effect.provideService(makePrimeAgentRpc({
          ...options,
          projectPath: cwd,
          environment: { ...options.environment, RLM_MAX_DEPTH: String(rlmMaxDepth) },
        }), Scope.Scope, scope),
      },
      ...(options.maxResident === undefined ? {} : { maxResident: options.maxResident }),
    });
  }),
);

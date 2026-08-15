import {
  isJsonNumber,
  isJsonRecord,
  isJsonString,
  type JsonRecord,
  type JsonValue,
} from '../../json-value/index.js';
import {
  createEffectScope,
  EffectScopeClosedError,
  type EffectCleanupError,
  type EffectScope,
} from '../../effect-scope/index.js';

/** The Ernie plugin API understood by this host. */
export const currentPluginApiVersion = 1 as const;

/** An icon token that Ernie can render for a contributed view. */
export type PluginViewIcon = 'globe' | 'puzzle';

/** A command declared by a plugin before activation. */
export interface PluginCommandContribution {
  readonly id: string;
  readonly title: string;
}

/** A primary workbench view declared by a plugin before activation. */
export interface PluginViewContribution {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: PluginViewIcon;
  readonly location: 'primary';
}

/** Declarative extension points owned by one plugin. */
export interface PluginContributions {
  readonly commands: readonly PluginCommandContribution[];
  readonly views: readonly PluginViewContribution[];
}

/** A condition that activates plugin code only when its capability is needed. */
export type PluginActivationEvent = Readonly<{
  event: 'view';
  viewId: string;
}>;

/** Serializable metadata and contributions for one Ernie plugin. */
export interface PluginManifest {
  readonly apiVersion: typeof currentPluginApiVersion;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly activationEvents: readonly PluginActivationEvent[];
  readonly contributes: PluginContributions;
}

/** Cleanup owned by an activated plugin. */
export interface PluginDisposable {
  /** Release resources acquired during activation. */
  dispose(): void | Promise<void>;
}

/** Work performed by one registered plugin command. */
export type PluginCommandHandler = () => void | Promise<void>;

/** Cleanup paired with one value acquired during plugin activation. */
export type PluginEffectCleanup = () => void | Promise<void>;

/** One plugin value acquired together with the cleanup that owns it. */
export interface PluginEffectAcquisition<Value> {
  readonly value: Value;
  readonly cleanup: PluginEffectCleanup;
}

/** Host capabilities available while one contributed view is rendered. */
export interface PluginViewRenderContext {
  /** Execute one command declared by the plugin that owns this view. */
  readonly executeCommand: (commandId: string) => Promise<PluginResult<void>>;
}

/** Render one plugin view inside the workbench slot assigned by Ernie. */
export type PluginViewRenderer<RenderedView> = (
  context: PluginViewRenderContext,
) => RenderedView;

/** Capabilities supplied to a plugin during its isolated activation transaction. */
export interface PluginActivationContext<RenderedView> {
  readonly pluginId: string;

  /**
   * Acquire one plugin-owned value and arm its cleanup immediately.
   *
   * Setup must reverse its own partial work before throwing.
   */
  acquire<Value>(
    setup: () =>
      | PluginEffectAcquisition<Value>
      | Promise<PluginEffectAcquisition<Value>>,
  ): Promise<Value>;

  /** Attach a handler to a command declared by this plugin. */
  registerCommand(commandId: string, handler: PluginCommandHandler): void;

  /** Attach a renderer to a view declared by this plugin. */
  registerView(viewId: string, renderer: PluginViewRenderer<RenderedView>): void;
}

/** The value returned by plugin activation, including optional lifecycle cleanup. */
export type PluginActivation =
  | void
  | PluginDisposable
  | Promise<void | PluginDisposable>;

/** One executable plugin supplied to the Ernie composition root. */
export interface PluginModule<RenderedView> {
  readonly manifest: PluginManifest;

  /** Lazily register runtime behavior for this plugin's declared contributions. */
  activate(context: PluginActivationContext<RenderedView>): PluginActivation;
}

/** A successful value or a typed failure returned without throwing. */
export type PluginResult<Value, Failure extends Error = PluginHostError> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Failure }>;

/** A manifest failed the stable plugin contract. */
export class InvalidPluginManifestError extends Error {
  readonly _tag = 'InvalidPluginManifestError';

  constructor(
    readonly pluginId: string | null,
    readonly reason: string,
  ) {
    super(`Invalid plugin manifest${pluginId === null ? '' : ` for ${pluginId}`}: ${reason}`);
  }
}

/** Two modules attempted to own the same plugin identifier. */
export class DuplicatePluginIdError extends Error {
  readonly _tag = 'DuplicatePluginIdError';

  constructor(readonly pluginId: string) {
    super(`Plugin ${pluginId} is registered more than once.`);
  }
}

/** Two plugins attempted to own the same contribution identifier. */
export class DuplicatePluginContributionError extends Error {
  readonly _tag = 'DuplicatePluginContributionError';

  constructor(
    readonly contributionId: string,
    readonly contributionKind: 'command' | 'view',
  ) {
    super(`Plugin ${contributionKind} ${contributionId} is registered more than once.`);
  }
}

/** A requested plugin is absent from this host. */
export class PluginNotFoundError extends Error {
  readonly _tag = 'PluginNotFoundError';

  constructor(readonly pluginId: string) {
    super(`Plugin ${pluginId} is not registered.`);
  }
}

/** A requested view is absent from this host. */
export class PluginViewNotFoundError extends Error {
  readonly _tag = 'PluginViewNotFoundError';

  constructor(readonly viewId: string) {
    super(`Plugin view ${viewId} is not registered.`);
  }
}

/** A caller requested a plugin capability after the user disabled it. */
export class PluginDisabledError extends Error {
  readonly _tag = 'PluginDisabledError';

  constructor(readonly pluginId: string) {
    super(`Plugin ${pluginId} is disabled.`);
  }
}

/** A requested command is absent from this host. */
export class PluginCommandNotFoundError extends Error {
  readonly _tag = 'PluginCommandNotFoundError';

  constructor(readonly commandId: string) {
    super(`Plugin command ${commandId} is not registered.`);
  }
}

/** Plugin activation failed without exposing the thrown value to callers. */
export class PluginActivationError extends Error {
  readonly _tag = 'PluginActivationError';

  constructor(
    readonly pluginId: string,
    cause: unknown,
  ) {
    super(`Plugin ${pluginId} could not activate.`, { cause });
  }
}

/** Plugin code retained an activation context beyond its owning attempt. */
export class PluginActivationContextClosedError extends Error {
  readonly _tag = 'PluginActivationContextClosedError';

  constructor(
    readonly pluginId: string,
    cause?: unknown,
  ) {
    super(
      `Plugin ${pluginId} used a closed activation context.`,
      cause === undefined ? undefined : { cause },
    );
  }
}

/** A plugin command failed without exposing the thrown value to callers. */
export class PluginCommandExecutionError extends Error {
  readonly _tag = 'PluginCommandExecutionError';

  constructor(
    readonly commandId: string,
    cause: unknown,
  ) {
    super(`Plugin command ${commandId} failed.`, { cause });
  }
}

/** A plugin view factory failed without exposing the thrown value to callers. */
export class PluginViewRenderError extends Error {
  readonly _tag = 'PluginViewRenderError';

  constructor(
    readonly viewId: string,
    cause: unknown,
  ) {
    super(`Plugin view ${viewId} could not render.`, { cause });
  }
}

/** One plugin effect cleanup failed after its ledger entry was consumed. */
export class PluginEffectCleanupError extends Error {
  readonly _tag = 'PluginEffectCleanupError';

  constructor(
    readonly pluginId: string,
    readonly sequence: number,
    cause: unknown,
  ) {
    super(`Plugin ${pluginId} cleanup ${sequence} failed.`, { cause });
  }
}

/** Plugin cleanup failed without preventing cleanup of older effects. */
export class PluginDeactivationError extends Error {
  readonly _tag = 'PluginDeactivationError';
  readonly failures: readonly PluginEffectCleanupError[];

  constructor(
    readonly pluginId: string,
    failures: readonly PluginEffectCleanupError[],
  ) {
    const stableFailures = Object.freeze([...failures]);
    super(`Plugin ${pluginId} could not deactivate cleanly.`, {
      cause: new AggregateError(stableFailures),
    });
    this.failures = stableFailures;
  }
}

/** A caller attempted work after the host ended its lifecycle. */
export class PluginHostDisposedError extends Error {
  readonly _tag = 'PluginHostDisposedError';

  constructor() {
    super('The plugin host has been disposed.');
  }
}

/** Every expected failure returned by the plugin host. */
export type PluginHostError =
  | InvalidPluginManifestError
  | DuplicatePluginIdError
  | DuplicatePluginContributionError
  | PluginNotFoundError
  | PluginViewNotFoundError
  | PluginDisabledError
  | PluginCommandNotFoundError
  | PluginActivationError
  | PluginCommandExecutionError
  | PluginViewRenderError
  | PluginDeactivationError
  | PluginHostDisposedError;

/** Runtime access to validated plugin metadata, activation, and commands. */
export interface PluginHost<RenderedView> {
  /** List immutable manifests in deterministic registration order. */
  listPlugins(): readonly PluginManifest[];

  /** List primary workbench views contributed by enabled plugins. */
  listViews(): readonly PluginViewContribution[];

  /** Report whether the user currently permits one plugin to contribute behavior. */
  isPluginEnabled(pluginId: string): boolean;

  /** Permit a disabled plugin to activate again after cleanup completes. */
  enablePlugin(pluginId: string): Promise<PluginResult<void>>;

  /** Remove one plugin's runtime contributions and release its resources. */
  disablePlugin(pluginId: string): Promise<PluginResult<void>>;

  /** Lazily activate and render the plugin that owns a selected view. */
  renderView(viewId: string): Promise<PluginResult<RenderedView>>;

  /** Lazily activate a command owner and execute the command. */
  executeCommand(commandId: string): Promise<PluginResult<void>>;

  /** Deactivate every active plugin and report isolated cleanup failures. */
  dispose(): Promise<readonly PluginDeactivationError[]>;
}

type PluginRuntimeState =
  | Readonly<{ status: 'inactive' }>
  | Readonly<{
      status: 'activating';
      activation: Promise<PluginResult<void>>;
    }>
  | Readonly<{ status: 'active'; scope: EffectScope }>
  | Readonly<{
      status: 'deactivating';
      deactivation: Promise<PluginResult<void>>;
    }>
  | Readonly<{ status: 'failed'; error: PluginActivationError }>;

interface PluginRecord<RenderedView> {
  readonly module: PluginModule<RenderedView>;
  enabled: boolean;
  state: PluginRuntimeState;
}

const pluginIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const pluginVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

function succeeded<Value>(value: Value): PluginResult<Value> {
  return { ok: true, value };
}

function failed<Value>(error: PluginHostError): PluginResult<Value> {
  return { ok: false, error };
}

function pluginCleanupFailures(
  pluginId: string,
  failures: readonly EffectCleanupError[],
): readonly PluginEffectCleanupError[] {
  return Object.freeze(
    failures.map(
      (failure) =>
        new PluginEffectCleanupError(pluginId, failure.sequence, failure.cause),
    ),
  );
}

function cleanupFailure(
  pluginId: string,
  failures: readonly EffectCleanupError[],
): PluginDeactivationError | null {
  return failures.length === 0
    ? null
    : new PluginDeactivationError(
        pluginId,
        pluginCleanupFailures(pluginId, failures),
      );
}

function readRequiredText(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return isJsonString(value) && value.trim().length > 0 ? value : null;
}

function parseCommandContributions(
  pluginId: string,
  value: JsonValue | undefined,
): PluginResult<readonly PluginCommandContribution[]> {
  if (!Array.isArray(value)) {
    return failed(
      new InvalidPluginManifestError(pluginId, 'contributes.commands must be an array.'),
    );
  }

  const commands: PluginCommandContribution[] = [];
  for (const item of value) {
    if (!isJsonRecord(item)) {
      return failed(
        new InvalidPluginManifestError(pluginId, 'Every command must be an object.'),
      );
    }
    const id = readRequiredText(item, 'id');
    const title = readRequiredText(item, 'title');
    if (id === null || title === null) {
      return failed(
        new InvalidPluginManifestError(pluginId, 'Every command requires id and title.'),
      );
    }
    commands.push({ id, title });
  }
  return succeeded(commands);
}

function parseViewContributions(
  pluginId: string,
  value: JsonValue | undefined,
): PluginResult<readonly PluginViewContribution[]> {
  if (!Array.isArray(value)) {
    return failed(
      new InvalidPluginManifestError(pluginId, 'contributes.views must be an array.'),
    );
  }

  const views: PluginViewContribution[] = [];
  for (const item of value) {
    if (!isJsonRecord(item)) {
      return failed(
        new InvalidPluginManifestError(pluginId, 'Every view must be an object.'),
      );
    }
    const id = readRequiredText(item, 'id');
    const title = readRequiredText(item, 'title');
    const description = readRequiredText(item, 'description');
    const icon = readRequiredText(item, 'icon');
    const location = readRequiredText(item, 'location');
    if (
      id === null ||
      title === null ||
      description === null ||
      (icon !== 'globe' && icon !== 'puzzle') ||
      location !== 'primary'
    ) {
      return failed(
        new InvalidPluginManifestError(
          pluginId,
          'Every view requires a supported id, title, description, icon, and location.',
        ),
      );
    }
    views.push({ id, title, description, icon, location });
  }
  return succeeded(views);
}

function parseActivationEvents(
  pluginId: string,
  value: JsonValue | undefined,
): PluginResult<readonly PluginActivationEvent[]> {
  if (!Array.isArray(value)) {
    return failed(
      new InvalidPluginManifestError(pluginId, 'activationEvents must be an array.'),
    );
  }

  const events: PluginActivationEvent[] = [];
  for (const item of value) {
    if (!isJsonRecord(item)) {
      return failed(
        new InvalidPluginManifestError(pluginId, 'Every activation event must be an object.'),
      );
    }
    const event = readRequiredText(item, 'event');
    const viewId = readRequiredText(item, 'viewId');
    if (event !== 'view' || viewId === null) {
      return failed(
        new InvalidPluginManifestError(pluginId, 'Every activation event must target a view.'),
      );
    }
    events.push({ event, viewId });
  }
  return succeeded(events);
}

function validateManifest(manifest: PluginManifest): InvalidPluginManifestError | null {
  if (!pluginIdPattern.test(manifest.id)) {
    return new InvalidPluginManifestError(manifest.id, 'id is not a stable dotted identifier.');
  }
  if (manifest.apiVersion !== currentPluginApiVersion) {
    return new InvalidPluginManifestError(manifest.id, 'apiVersion is not supported.');
  }
  if (!pluginVersionPattern.test(manifest.version)) {
    return new InvalidPluginManifestError(manifest.id, 'version must use semantic versioning.');
  }
  if (manifest.name.trim().length === 0 || manifest.description.trim().length === 0) {
    return new InvalidPluginManifestError(manifest.id, 'name and description must not be empty.');
  }

  const contributionPrefix = `${manifest.id}.`;
  const viewIds = new Set(manifest.contributes.views.map((view) => view.id));
  for (const view of manifest.contributes.views) {
    if (!view.id.startsWith(contributionPrefix)) {
      return new InvalidPluginManifestError(
        manifest.id,
        `view ${view.id} must be owned by its plugin id.`,
      );
    }
  }
  for (const command of manifest.contributes.commands) {
    if (!command.id.startsWith(contributionPrefix)) {
      return new InvalidPluginManifestError(
        manifest.id,
        `command ${command.id} must be owned by its plugin id.`,
      );
    }
  }
  for (const activationEvent of manifest.activationEvents) {
    if (!viewIds.has(activationEvent.viewId)) {
      return new InvalidPluginManifestError(
        manifest.id,
        `activation view ${activationEvent.viewId} is not contributed by this plugin.`,
      );
    }
  }
  return null;
}

function immutableManifest(manifest: PluginManifest): PluginManifest {
  return Object.freeze({
    apiVersion: manifest.apiVersion,
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    activationEvents: Object.freeze(
      manifest.activationEvents.map((activationEvent) =>
        Object.freeze({ ...activationEvent }),
      ),
    ),
    contributes: Object.freeze({
      commands: Object.freeze(
        manifest.contributes.commands.map((command) => Object.freeze({ ...command })),
      ),
      views: Object.freeze(
        manifest.contributes.views.map((view) => Object.freeze({ ...view })),
      ),
    }),
  });
}

/** Parse serialized plugin metadata before it enters the plugin host. */
export function parsePluginManifest(value: JsonValue): PluginResult<PluginManifest> {
  if (!isJsonRecord(value)) {
    return failed(new InvalidPluginManifestError(null, 'manifest must be an object.'));
  }
  const apiVersion = value.apiVersion;
  const id = readRequiredText(value, 'id');
  const name = readRequiredText(value, 'name');
  const version = readRequiredText(value, 'version');
  const description = readRequiredText(value, 'description');
  if (
    !isJsonNumber(apiVersion) ||
    apiVersion !== currentPluginApiVersion ||
    id === null ||
    name === null ||
    version === null ||
    description === null
  ) {
    return failed(
      new InvalidPluginManifestError(id, 'apiVersion, id, name, version, and description are required.'),
    );
  }
  const activationEvents = parseActivationEvents(id, value.activationEvents);
  if (!activationEvents.ok) return activationEvents;
  if (!isJsonRecord(value.contributes)) {
    return failed(
      new InvalidPluginManifestError(id, 'contributes must be an object.'),
    );
  }
  const commands = parseCommandContributions(id, value.contributes.commands);
  if (!commands.ok) return commands;
  const views = parseViewContributions(id, value.contributes.views);
  if (!views.ok) return views;

  const manifest: PluginManifest = {
    apiVersion,
    id,
    name,
    version,
    description,
    activationEvents: activationEvents.value,
    contributes: { commands: commands.value, views: views.value },
  };
  const error = validateManifest(manifest);
  return error === null ? succeeded(immutableManifest(manifest)) : failed(error);
}

/** Build one host after validating all module and contribution ownership. */
export function createPluginHost<RenderedView>(
  modules: readonly PluginModule<RenderedView>[],
  initiallyDisabledPluginIds: ReadonlySet<string> = new Set<string>(),
): PluginResult<PluginHost<RenderedView>> {
  const records = new Map<string, PluginRecord<RenderedView>>();
  const commandOwners = new Map<string, string>();
  const viewOwners = new Map<string, string>();
  const manifests: PluginManifest[] = [];

  for (const module of modules) {
    const manifestError = validateManifest(module.manifest);
    if (manifestError !== null) return failed(manifestError);
    if (records.has(module.manifest.id)) {
      return failed(new DuplicatePluginIdError(module.manifest.id));
    }

    const manifest = immutableManifest(module.manifest);
    for (const command of manifest.contributes.commands) {
      if (commandOwners.has(command.id)) {
        return failed(new DuplicatePluginContributionError(command.id, 'command'));
      }
      commandOwners.set(command.id, manifest.id);
    }
    for (const view of manifest.contributes.views) {
      if (viewOwners.has(view.id)) {
        return failed(new DuplicatePluginContributionError(view.id, 'view'));
      }
      viewOwners.set(view.id, manifest.id);
    }
    manifests.push(manifest);
    records.set(manifest.id, {
      module: {
        manifest,
        activate: (context) => module.activate(context),
      },
      enabled: !initiallyDisabledPluginIds.has(manifest.id),
      state: { status: 'inactive' },
    });
  }

  const commandHandlers = new Map<string, PluginCommandHandler>();
  const viewRenderers = new Map<string, PluginViewRenderer<RenderedView>>();
  let lifecycle: 'open' | 'disposing' | 'disposed' = 'open';
  let disposalPromise: Promise<readonly PluginDeactivationError[]> | null = null;

  const activatePlugin = async (pluginId: string): Promise<PluginResult<void>> => {
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const record = records.get(pluginId);
    if (record === undefined) return failed(new PluginNotFoundError(pluginId));
    if (!record.enabled) return failed(new PluginDisabledError(pluginId));
    if (record.state.status === 'active') return succeeded(undefined);
    if (record.state.status === 'failed') return failed(record.state.error);
    if (record.state.status === 'activating') return record.state.activation;

    const activation = Promise.resolve().then(async (): Promise<PluginResult<void>> => {
      const localHandlers = new Map<string, PluginCommandHandler>();
      const localViewRenderers = new Map<string, PluginViewRenderer<RenderedView>>();
      const scope = createEffectScope();
      let activationOpen = true;
      const declaredCommands = new Set(
        record.module.manifest.contributes.commands.map((command) => command.id),
      );
      const declaredViews = new Set(
        record.module.manifest.contributes.views.map((view) => view.id),
      );
      const assertActivationOpen = (): void => {
        if (!activationOpen) {
          throw new PluginActivationContextClosedError(pluginId);
        }
      };
      const closeActivation = (): void => {
        activationOpen = false;
        scope.close();
      };
      const context: PluginActivationContext<RenderedView> = {
        pluginId,
        async acquire(setup) {
          assertActivationOpen();
          try {
            return await scope.acquire(setup);
          } catch (cause) {
            if (cause instanceof EffectScopeClosedError) {
              throw new PluginActivationContextClosedError(pluginId, cause);
            }
            throw cause;
          }
        },
        registerCommand(commandId, handler) {
          assertActivationOpen();
          if (!declaredCommands.has(commandId)) {
            throw new Error(`Plugin ${pluginId} did not declare command ${commandId}.`);
          }
          if (localHandlers.has(commandId)) {
            throw new Error(`Plugin ${pluginId} registered command ${commandId} twice.`);
          }
          localHandlers.set(commandId, handler);
        },
        registerView(viewId, renderer) {
          assertActivationOpen();
          if (!declaredViews.has(viewId)) {
            throw new Error(`Plugin ${pluginId} did not declare view ${viewId}.`);
          }
          if (localViewRenderers.has(viewId)) {
            throw new Error(`Plugin ${pluginId} registered view ${viewId} twice.`);
          }
          localViewRenderers.set(viewId, renderer);
        },
      };

      try {
        const disposable = (await record.module.activate(context)) ?? null;
        if (disposable !== null) {
          await scope.acquire(() => ({
            value: undefined,
            cleanup: () => disposable.dispose(),
          }));
        }
        closeActivation();
        for (const commandId of declaredCommands) {
          if (!localHandlers.has(commandId)) {
            throw new Error(`Plugin ${pluginId} did not register command ${commandId}.`);
          }
        }
        for (const viewId of declaredViews) {
          if (!localViewRenderers.has(viewId)) {
            throw new Error(`Plugin ${pluginId} did not register view ${viewId}.`);
          }
        }
        if (!record.enabled || lifecycle !== 'open') {
          const recoveryError = cleanupFailure(pluginId, await scope.drain());
          record.state = { status: 'inactive' };
          if (recoveryError !== null) {
            record.enabled = false;
            return failed(recoveryError);
          }
          return lifecycle === 'open'
            ? failed(new PluginDisabledError(pluginId))
            : failed(new PluginHostDisposedError());
        }
        for (const [commandId, handler] of localHandlers) {
          commandHandlers.set(commandId, handler);
        }
        for (const [viewId, renderer] of localViewRenderers) {
          viewRenderers.set(viewId, renderer);
        }
        record.state = { status: 'active', scope };
        return succeeded(undefined);
      } catch (cause) {
        closeActivation();
        const recoveryError = cleanupFailure(pluginId, await scope.drain());
        if (recoveryError !== null) {
          record.enabled = false;
          record.state = { status: 'inactive' };
          return failed(recoveryError);
        }
        if (lifecycle !== 'open') {
          record.state = { status: 'inactive' };
          return failed(new PluginHostDisposedError());
        }
        if (!record.enabled) {
          record.state = { status: 'inactive' };
          return failed(new PluginDisabledError(pluginId));
        }
        const error = new PluginActivationError(pluginId, cause);
        record.state = { status: 'failed', error };
        return failed(error);
      }
    });

    record.state = { status: 'activating', activation };
    return activation;
  };

  const executeCommand = async (commandId: string): Promise<PluginResult<void>> => {
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const pluginId = commandOwners.get(commandId);
    if (pluginId === undefined) {
      return failed(new PluginCommandNotFoundError(commandId));
    }
    const activation = await activatePlugin(pluginId);
    if (!activation.ok) return activation;
    const handler = commandHandlers.get(commandId);
    if (handler === undefined) {
      return failed(new PluginCommandNotFoundError(commandId));
    }
    try {
      await handler();
      return succeeded(undefined);
    } catch (cause) {
      return failed(new PluginCommandExecutionError(commandId, cause));
    }
  };

  const host: PluginHost<RenderedView> = {
    listPlugins() {
      return manifests;
    },
    listViews() {
      return manifests.flatMap((manifest) =>
        records.get(manifest.id)?.enabled === true
          ? manifest.contributes.views
          : [],
      );
    },
    isPluginEnabled(pluginId) {
      return records.get(pluginId)?.enabled === true;
    },
    async enablePlugin(pluginId) {
      if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      const record = records.get(pluginId);
      if (record === undefined) return failed(new PluginNotFoundError(pluginId));
      if (!record.enabled && record.state.status === 'activating') {
        const activation = await record.state.activation;
        if (
          !activation.ok &&
          activation.error instanceof PluginDeactivationError
        ) {
          return activation;
        }
        if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      }
      if (record.state.status === 'deactivating') {
        const deactivation = await record.state.deactivation;
        if (!deactivation.ok) return deactivation;
        if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      }
      record.enabled = true;
      if (record.state.status === 'failed') {
        record.state = { status: 'inactive' };
      }
      return succeeded(undefined);
    },
    async disablePlugin(pluginId) {
      if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      const record = records.get(pluginId);
      if (record === undefined) return failed(new PluginNotFoundError(pluginId));
      if (record.state.status === 'deactivating') {
        return record.state.deactivation;
      }

      const wasEnabled = record.enabled;
      record.enabled = false;
      if (record.state.status === 'activating') {
        const activation = await record.state.activation;
        if (
          !activation.ok &&
          activation.error instanceof PluginDeactivationError
        ) {
          return activation;
        }
      }
      if (!wasEnabled) {
        return succeeded(undefined);
      }
      for (const command of record.module.manifest.contributes.commands) {
        commandHandlers.delete(command.id);
      }
      for (const view of record.module.manifest.contributes.views) {
        viewRenderers.delete(view.id);
      }
      const scope = record.state.status === 'active' ? record.state.scope : null;
      if (scope === null) {
        record.state = { status: 'inactive' };
        return succeeded(undefined);
      }
      const deactivation = Promise.resolve().then(
        async (): Promise<PluginResult<void>> => {
          const recoveryError = cleanupFailure(pluginId, await scope.drain());
          record.state = { status: 'inactive' };
          return recoveryError === null
            ? succeeded(undefined)
            : failed(recoveryError);
        },
      );
      record.state = { status: 'deactivating', deactivation };
      return deactivation;
    },
    async renderView(viewId) {
      if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      const pluginId = viewOwners.get(viewId);
      if (pluginId === undefined) return failed(new PluginViewNotFoundError(viewId));
      const activation = await activatePlugin(pluginId);
      if (!activation.ok) return activation;
      const renderer = viewRenderers.get(viewId);
      if (renderer === undefined) return failed(new PluginViewNotFoundError(viewId));
      try {
        return succeeded(
          renderer({
            executeCommand: (commandId) =>
              commandOwners.get(commandId) === pluginId
                ? executeCommand(commandId)
                : Promise.resolve(failed(new PluginCommandNotFoundError(commandId))),
          }),
        );
      } catch (cause) {
        return failed(new PluginViewRenderError(viewId, cause));
      }
    },
    executeCommand,
    dispose() {
      if (disposalPromise !== null) return disposalPromise;
      lifecycle = 'disposing';
      disposalPromise = Promise.resolve().then(async () => {
        const errors: PluginDeactivationError[] = [];
        for (const record of records.values()) record.enabled = false;
        await Promise.all(
          [...records.entries()].map(async ([pluginId, record]) => {
            if (record.state.status === 'activating') {
              const activation = await record.state.activation;
              if (
                !activation.ok &&
                activation.error instanceof PluginDeactivationError
              ) {
                errors.push(activation.error);
              }
            }
            if (record.state.status === 'deactivating') {
              const deactivation = await record.state.deactivation;
              if (
                !deactivation.ok &&
                deactivation.error instanceof PluginDeactivationError
              ) {
                errors.push(deactivation.error);
              }
            }
            if (record.state.status !== 'active') {
              record.state = { status: 'inactive' };
              return;
            }
            const recoveryError = cleanupFailure(
              pluginId,
              await record.state.scope.drain(),
            );
            if (recoveryError !== null) errors.push(recoveryError);
            record.state = { status: 'inactive' };
          }),
        );
        commandHandlers.clear();
        viewRenderers.clear();
        lifecycle = 'disposed';
        return Object.freeze(errors);
      });
      return disposalPromise;
    },
  };

  return succeeded(host);
}

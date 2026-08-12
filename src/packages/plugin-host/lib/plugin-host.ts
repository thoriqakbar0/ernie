import {
  isJsonNumber,
  isJsonRecord,
  isJsonString,
  type JsonRecord,
  type JsonValue,
} from '../../json-value/index.js';

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

/** Capabilities supplied to a plugin during its isolated activation transaction. */
export interface PluginActivationContext {
  readonly pluginId: string;

  /** Attach a handler to a command declared by this plugin. */
  registerCommand(commandId: string, handler: PluginCommandHandler): void;
}

/** The value returned by plugin activation, including optional lifecycle cleanup. */
export type PluginActivation =
  | void
  | PluginDisposable
  | Promise<void | PluginDisposable>;

/** One executable plugin supplied to the Ernie composition root. */
export interface PluginModule {
  readonly manifest: PluginManifest;

  /** Lazily register runtime behavior for this plugin's declared contributions. */
  activate(context: PluginActivationContext): PluginActivation;
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

/** Plugin cleanup failed without preventing cleanup of other plugins. */
export class PluginDeactivationError extends Error {
  readonly _tag = 'PluginDeactivationError';

  constructor(
    readonly pluginId: string,
    cause: unknown,
  ) {
    super(`Plugin ${pluginId} could not deactivate cleanly.`, { cause });
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
  | PluginCommandNotFoundError
  | PluginActivationError
  | PluginCommandExecutionError
  | PluginHostDisposedError;

/** Runtime access to validated plugin metadata, activation, and commands. */
export interface PluginHost {
  /** List immutable manifests in deterministic registration order. */
  listPlugins(): readonly PluginManifest[];

  /** List primary workbench views contributed by all registered plugins. */
  listViews(): readonly PluginViewContribution[];

  /** Lazily activate the plugin that owns a selected view. */
  activateView(viewId: string): Promise<PluginResult<void>>;

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
  | Readonly<{ status: 'active'; disposable: PluginDisposable | null }>
  | Readonly<{ status: 'failed'; error: PluginActivationError }>;

interface PluginRecord {
  readonly module: PluginModule;
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

function readRequiredText(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return isJsonString(value) && value.trim().length > 0 ? value : null;
}

function parseCommandContributions(
  pluginId: string,
  value: JsonValue,
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
  value: JsonValue,
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
  value: JsonValue,
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
export function createPluginHost(
  modules: readonly PluginModule[],
): PluginResult<PluginHost> {
  const records = new Map<string, PluginRecord>();
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
      module: { manifest, activate: module.activate },
      state: { status: 'inactive' },
    });
  }

  const commandHandlers = new Map<string, PluginCommandHandler>();
  let lifecycle: 'open' | 'disposing' | 'disposed' = 'open';

  const activatePlugin = async (pluginId: string): Promise<PluginResult<void>> => {
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const record = records.get(pluginId);
    if (record === undefined) return failed(new PluginNotFoundError(pluginId));
    if (record.state.status === 'active') return succeeded(undefined);
    if (record.state.status === 'failed') return failed(record.state.error);
    if (record.state.status === 'activating') return record.state.activation;

    const activation = Promise.resolve().then(async (): Promise<PluginResult<void>> => {
      const localHandlers = new Map<string, PluginCommandHandler>();
      const declaredCommands = new Set(
        record.module.manifest.contributes.commands.map((command) => command.id),
      );
      const context: PluginActivationContext = {
        pluginId,
        registerCommand(commandId, handler) {
          if (!declaredCommands.has(commandId)) {
            throw new Error(`Plugin ${pluginId} did not declare command ${commandId}.`);
          }
          if (localHandlers.has(commandId)) {
            throw new Error(`Plugin ${pluginId} registered command ${commandId} twice.`);
          }
          localHandlers.set(commandId, handler);
        },
      };

      try {
        const disposable = (await record.module.activate(context)) ?? null;
        for (const commandId of declaredCommands) {
          if (!localHandlers.has(commandId)) {
            throw new Error(`Plugin ${pluginId} did not register command ${commandId}.`);
          }
        }
        for (const [commandId, handler] of localHandlers) {
          commandHandlers.set(commandId, handler);
        }
        record.state = { status: 'active', disposable };
        return succeeded(undefined);
      } catch (cause) {
        const error = new PluginActivationError(pluginId, cause);
        record.state = { status: 'failed', error };
        return failed(error);
      }
    });

    record.state = { status: 'activating', activation };
    return activation;
  };

  const host: PluginHost = {
    listPlugins() {
      return manifests;
    },
    listViews() {
      return manifests.flatMap((manifest) => manifest.contributes.views);
    },
    async activateView(viewId) {
      if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      const pluginId = viewOwners.get(viewId);
      return pluginId === undefined
        ? failed(new PluginNotFoundError(viewId))
        : activatePlugin(pluginId);
    },
    async executeCommand(commandId) {
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
    },
    async dispose() {
      if (lifecycle !== 'open') return [];
      lifecycle = 'disposing';
      const errors: PluginDeactivationError[] = [];
      await Promise.all(
        [...records.entries()].map(async ([pluginId, record]) => {
          if (record.state.status === 'activating') {
            await record.state.activation;
          }
          if (record.state.status !== 'active' || record.state.disposable === null) {
            return;
          }
          try {
            await record.state.disposable.dispose();
          } catch (cause) {
            errors.push(new PluginDeactivationError(pluginId, cause));
          }
        }),
      );
      commandHandlers.clear();
      lifecycle = 'disposed';
      return errors;
    },
  };

  return succeeded(host);
}

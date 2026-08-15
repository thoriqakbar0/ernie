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
export const currentPluginApiVersion = 3 as const;

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

/** A condition that activates plugin code when Ernie starts or opens a view. */
export type PluginActivationEvent =
  | Readonly<{ event: 'startup' }>
  | Readonly<{
      event: 'view';
      viewId: string;
    }>;

/** Serializable metadata and service dependencies for one Ernie plugin. */
export interface PluginManifest {
  readonly apiVersion: typeof currentPluginApiVersion;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly activationEvents: readonly PluginActivationEvent[];
  readonly provides: readonly string[];
  readonly requires: readonly string[];
  readonly contributes: PluginContributions;
}

const pluginServiceKeyBrand: unique symbol = Symbol('PluginServiceKey');

/** An opaque runtime token that preserves one service value's TypeScript type. */
export interface PluginServiceKey<Value> {
  readonly id: string;
  readonly [pluginServiceKeyBrand]: (value: Value) => Value;
}

class DefinedPluginServiceKey<Value> implements PluginServiceKey<Value> {
  declare readonly [pluginServiceKeyBrand]: (value: Value) => Value;

  constructor(readonly id: string) {}
}

/** Cleanup owned by an activated plugin. */
export interface PluginDisposable {
  /** Release resources acquired during activation once, without automatic retry. */
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
   * The returned promise rejects with `PluginActivationContextClosedError`
   * when acquisition starts after the activation transaction closes.
   */
  acquire<Value>(
    setup: () =>
      | PluginEffectAcquisition<Value>
      | Promise<PluginEffectAcquisition<Value>>,
  ): Promise<Value>;

  /** Publish one runtime service declared by this plugin. */
  provideService<Value>(key: PluginServiceKey<Value>, value: Value): void;

  /** Read one required runtime service while this activation remains alive. */
  getService<Value>(key: PluginServiceKey<Value>): Value;

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

  /** Register runtime behavior when one declared activation event occurs. */
  activate(context: PluginActivationContext<RenderedView>): PluginActivation;
}

/** A successful value or a typed failure returned without throwing. */
export type PluginResult<Value, Failure extends Error = PluginHostError> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: Failure }>;

/** A service key identifier is not safe for the stable plugin contract. */
export class InvalidPluginServiceKeyError extends Error {
  readonly _tag = 'InvalidPluginServiceKeyError';

  constructor(readonly serviceId: string) {
    super(`Plugin service key ${serviceId} is not a stable dotted identifier.`);
  }
}

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

/** Two plugins attempted to provide the same runtime service. */
export class DuplicatePluginServiceProviderError extends Error {
  readonly _tag = 'DuplicatePluginServiceProviderError';
  readonly providerPluginIds: readonly string[];

  constructor(
    readonly serviceId: string,
    providerPluginIds: readonly string[],
  ) {
    const stableProviderPluginIds = Object.freeze([...providerPluginIds]);
    super(`Plugin service ${serviceId} has more than one provider.`);
    this.providerPluginIds = stableProviderPluginIds;
  }
}

/** A required runtime service has no registered provider. */
export class MissingPluginServiceProviderError extends Error {
  readonly _tag = 'MissingPluginServiceProviderError';

  constructor(
    readonly consumerPluginId: string,
    readonly serviceId: string,
  ) {
    super(`Plugin ${consumerPluginId} requires service ${serviceId}, but no provider is registered.`);
  }
}

/** Required plugin services form a dependency cycle. */
export class PluginDependencyCycleError extends Error {
  readonly _tag = 'PluginDependencyCycleError';
  readonly pluginIds: readonly string[];

  constructor(pluginIds: readonly string[]) {
    const stablePluginIds = Object.freeze([...pluginIds]);
    super(`Plugin service dependencies contain a cycle: ${stablePluginIds.join(' -> ')}.`);
    this.pluginIds = stablePluginIds;
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

/** Plugin code attempted undeclared or mismatched runtime service access. */
export class PluginServiceAccessError extends Error {
  readonly _tag = 'PluginServiceAccessError';

  constructor(
    readonly pluginId: string,
    readonly serviceId: string,
    readonly operation: 'consume' | 'provide',
    readonly reason: 'duplicate' | 'key-mismatch' | 'undeclared' | 'unavailable',
  ) {
    super(`Plugin ${pluginId} cannot ${operation} service ${serviceId}: ${reason}.`);
  }
}

/** A required provider is disabled, failed, or could not activate. */
export class PluginDependencyUnavailableError extends Error {
  readonly _tag = 'PluginDependencyUnavailableError';

  constructor(
    readonly consumerPluginId: string,
    readonly serviceId: string,
    readonly providerPluginId: string,
    readonly providerFailureTag: string | null = null,
  ) {
    super(`Plugin ${consumerPluginId} cannot use unavailable service ${serviceId} from ${providerPluginId}.`);
  }
}

/** Plugin activation failed without exposing the thrown value in its message. */
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

/** A plugin command failed without exposing the thrown value in its message. */
export class PluginCommandExecutionError extends Error {
  readonly _tag = 'PluginCommandExecutionError';

  constructor(
    readonly commandId: string,
    cause: unknown,
  ) {
    super(`Plugin command ${commandId} failed.`, { cause });
  }
}

/** A plugin view factory failed without exposing the thrown value in its message. */
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

/** A dependency cascade completed with one or more isolated cleanup failures. */
export class PluginCascadeDeactivationError extends Error {
  readonly _tag = 'PluginCascadeDeactivationError';
  readonly failures: readonly PluginDeactivationError[];

  constructor(
    readonly pluginId: string,
    failures: readonly PluginDeactivationError[],
  ) {
    const stableFailures = Object.freeze([...failures]);
    super(`Plugin ${pluginId} dependency cleanup completed with failures.`, {
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
  | DuplicatePluginServiceProviderError
  | MissingPluginServiceProviderError
  | PluginDependencyCycleError
  | PluginNotFoundError
  | PluginViewNotFoundError
  | PluginDisabledError
  | PluginCommandNotFoundError
  | PluginDependencyUnavailableError
  | PluginActivationError
  | PluginCommandExecutionError
  | PluginViewRenderError
  | PluginDeactivationError
  | PluginCascadeDeactivationError
  | PluginHostDisposedError;

/** Runtime access to validated plugin metadata, activation, and commands. */
export interface PluginHost<RenderedView> {
  /** List immutable manifests in deterministic registration order. */
  listPlugins(): readonly PluginManifest[];

  /** List primary workbench views whose required providers are available. */
  listViews(): readonly PluginViewContribution[];

  /** Report whether the user currently permits one plugin to contribute behavior. */
  isPluginEnabled(pluginId: string): boolean;

  /** Activate enabled plugins that own application-wide startup behavior. */
  activateStartupPlugins(): Promise<readonly PluginHostError[]>;

  /** Permit a disabled plugin and demanded dependents to activate again. */
  enablePlugin(pluginId: string): Promise<PluginResult<void>>;

  /** Remove one plugin and active dependents in dependency-safe order. */
  disablePlugin(pluginId: string): Promise<PluginResult<void>>;

  /** Lazily activate required providers, then render the selected plugin view. */
  renderView(viewId: string): Promise<PluginResult<RenderedView>>;

  /** Lazily activate required providers, then execute the selected command. */
  executeCommand(commandId: string): Promise<PluginResult<void>>;

  /** Deactivate every active plugin in reverse dependency order. */
  dispose(): Promise<readonly PluginDeactivationError[]>;
}

interface PluginRuntimeResources {
  readonly scope: EffectScope;
  readonly closeServiceAccess: () => void;
}

type PluginRuntimeState =
  | Readonly<{ status: 'disabled' }>
  | Readonly<{ status: 'inactive' }>
  | Readonly<{
      status: 'activating';
      activation: Promise<PluginResult<void>>;
    }>
  | Readonly<{
      status: 'disabling-activation';
      activation: Promise<PluginResult<void>>;
    }>
  | Readonly<{
      status: 'active';
      resources: PluginRuntimeResources;
    }>
  | Readonly<{
      status: 'deactivation-requested';
      resources: PluginRuntimeResources;
    }>
  | Readonly<{
      status: 'deactivating';
      deactivation: Promise<PluginDeactivationError | null>;
      disableWhenComplete: boolean;
    }>
  | Readonly<{ status: 'failed'; error: PluginActivationError }>;

interface PluginRecord<RenderedView> {
  readonly module: PluginModule<RenderedView>;
  demanded: boolean;
  state: PluginRuntimeState;
  readonly pendingDeactivationErrors: PluginDeactivationError[];
}

interface PublishedPluginService {
  readonly key: object;
  readonly providerPluginId: string;
  readonly value: unknown;
}

type PluginHostLifecycle = 'disposed' | 'disposing' | 'open';

const pluginIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const pluginVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const pluginServiceIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;

/** Create one immutable typed key for a manifest-declared runtime service. */
export function createPluginServiceKey<Value>(
  serviceId: string,
): PluginServiceKey<Value> {
  if (!pluginServiceIdPattern.test(serviceId)) {
    throw new InvalidPluginServiceKeyError(serviceId);
  }
  return Object.freeze(new DefinedPluginServiceKey<Value>(serviceId));
}

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
    if (event === 'startup') {
      events.push({ event });
      continue;
    }
    const viewId = readRequiredText(item, 'viewId');
    if (event !== 'view' || viewId === null) {
      return failed(
        new InvalidPluginManifestError(
          pluginId,
          'Every activation event must be startup or target a view.',
        ),
      );
    }
    events.push({ event, viewId });
  }
  return succeeded(events);
}

function parseServiceDeclarations(
  pluginId: string,
  field: 'provides' | 'requires',
  value: JsonValue | undefined,
): PluginResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return failed(new InvalidPluginManifestError(pluginId, `${field} must be an array.`));
  }
  const serviceIds: string[] = [];
  for (const item of value) {
    if (!isJsonString(item) || item.trim().length === 0) {
      return failed(
        new InvalidPluginManifestError(pluginId, `Every ${field} entry must be a service identifier.`),
      );
    }
    serviceIds.push(item);
  }
  return succeeded(serviceIds);
}

function duplicateValue(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
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

  const duplicateProvidedService = duplicateValue(manifest.provides);
  if (duplicateProvidedService !== null) {
    return new InvalidPluginManifestError(
      manifest.id,
      `provided service ${duplicateProvidedService} is declared more than once.`,
    );
  }
  const duplicateRequiredService = duplicateValue(manifest.requires);
  if (duplicateRequiredService !== null) {
    return new InvalidPluginManifestError(
      manifest.id,
      `required service ${duplicateRequiredService} is declared more than once.`,
    );
  }
  const servicePrefix = `${manifest.id}.`;
  for (const serviceId of manifest.provides) {
    if (!pluginServiceIdPattern.test(serviceId) || !serviceId.startsWith(servicePrefix)) {
      return new InvalidPluginManifestError(
        manifest.id,
        `provided service ${serviceId} must use its plugin namespace.`,
      );
    }
  }
  for (const serviceId of manifest.requires) {
    if (!pluginServiceIdPattern.test(serviceId)) {
      return new InvalidPluginManifestError(
        manifest.id,
        `required service ${serviceId} is not a stable dotted identifier.`,
      );
    }
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
    if (
      activationEvent.event === 'view' &&
      !viewIds.has(activationEvent.viewId)
    ) {
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
    provides: Object.freeze([...manifest.provides]),
    requires: Object.freeze([...manifest.requires]),
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
  const provides = parseServiceDeclarations(id, 'provides', value.provides);
  if (!provides.ok) return provides;
  const requires = parseServiceDeclarations(id, 'requires', value.requires);
  if (!requires.ok) return requires;
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
    provides: provides.value,
    requires: requires.value,
    contributes: { commands: commands.value, views: views.value },
  };
  const error = validateManifest(manifest);
  return error === null ? succeeded(immutableManifest(manifest)) : failed(error);
}

function dependencyCycle(
  pluginIds: readonly string[],
  dependenciesByPluginId: ReadonlyMap<string, readonly string[]>,
): readonly string[] | null {
  const states = new Map<string, 'visited' | 'visiting'>();
  const path: string[] = [];

  const visit = (pluginId: string): readonly string[] | null => {
    const state = states.get(pluginId);
    if (state === 'visited') return null;
    if (state === 'visiting') {
      const cycleStart = path.indexOf(pluginId);
      return Object.freeze([...path.slice(cycleStart), pluginId]);
    }

    states.set(pluginId, 'visiting');
    path.push(pluginId);
    for (const dependencyId of dependenciesByPluginId.get(pluginId) ?? []) {
      const cycle = visit(dependencyId);
      if (cycle !== null) return cycle;
    }
    path.pop();
    states.set(pluginId, 'visited');
    return null;
  };

  for (const pluginId of pluginIds) {
    const cycle = visit(pluginId);
    if (cycle !== null) return cycle;
  }
  return null;
}

function topologicalOrder(
  pluginIds: readonly string[],
  dependenciesByPluginId: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (pluginId: string): void => {
    if (visited.has(pluginId)) return;
    visited.add(pluginId);
    for (const dependencyId of dependenciesByPluginId.get(pluginId) ?? []) {
      visit(dependencyId);
    }
    ordered.push(pluginId);
  };

  for (const pluginId of pluginIds) visit(pluginId);
  return Object.freeze(ordered);
}

function providerFailureTag(state: PluginRuntimeState): string | null {
  return state.status === 'failed' ? state.error._tag : null;
}

function stateIsEnabled(state: PluginRuntimeState): boolean {
  switch (state.status) {
    case 'active':
    case 'activating':
    case 'failed':
    case 'inactive':
      return true;
    case 'deactivating':
      return !state.disableWhenComplete;
    case 'deactivation-requested':
    case 'disabled':
    case 'disabling-activation':
      return false;
  }
}

function stateRequestsDisable(state: PluginRuntimeState): boolean {
  switch (state.status) {
    case 'deactivation-requested':
    case 'disabled':
    case 'disabling-activation':
      return true;
    case 'deactivating':
      return state.disableWhenComplete;
    case 'active':
    case 'activating':
    case 'failed':
    case 'inactive':
      return false;
  }
}

function requestPluginDisable<RenderedView>(
  record: PluginRecord<RenderedView>,
): void {
  switch (record.state.status) {
    case 'active':
      record.state = {
        status: 'deactivation-requested',
        resources: record.state.resources,
      };
      break;
    case 'activating':
      record.state = {
        status: 'disabling-activation',
        activation: record.state.activation,
      };
      break;
    case 'deactivating':
      record.state = {
        status: 'deactivating',
        deactivation: record.state.deactivation,
        disableWhenComplete: true,
      };
      break;
    case 'failed':
    case 'inactive':
      record.state = { status: 'disabled' };
      break;
    case 'deactivation-requested':
    case 'disabled':
    case 'disabling-activation':
      break;
  }
}

/** Build one host after validating all modules and their complete service graph. */
export function createPluginHost<RenderedView>(
  modules: readonly PluginModule<RenderedView>[],
  initiallyDisabledPluginIds: ReadonlySet<string> = new Set<string>(),
): PluginResult<PluginHost<RenderedView>> {
  const records = new Map<string, PluginRecord<RenderedView>>();
  const commandOwners = new Map<string, string>();
  const viewOwners = new Map<string, string>();
  const serviceProviders = new Map<string, string>();
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
    for (const serviceId of manifest.provides) {
      const existingProviderId = serviceProviders.get(serviceId);
      if (existingProviderId !== undefined) {
        return failed(
          new DuplicatePluginServiceProviderError(serviceId, [
            existingProviderId,
            manifest.id,
          ]),
        );
      }
      serviceProviders.set(serviceId, manifest.id);
    }
    manifests.push(manifest);
    records.set(manifest.id, {
      module: {
        manifest,
        activate: (context) => module.activate(context),
      },
      demanded: false,
      state: initiallyDisabledPluginIds.has(manifest.id)
        ? { status: 'disabled' }
        : { status: 'inactive' },
      pendingDeactivationErrors: [],
    });
  }

  const dependenciesByPluginId = new Map<string, readonly string[]>();
  const dependentsByPluginId = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    const dependencyIds: string[] = [];
    const seenDependencyIds = new Set<string>();
    for (const serviceId of manifest.requires) {
      const providerPluginId = serviceProviders.get(serviceId);
      if (providerPluginId === undefined) {
        return failed(new MissingPluginServiceProviderError(manifest.id, serviceId));
      }
      if (!seenDependencyIds.has(providerPluginId)) {
        seenDependencyIds.add(providerPluginId);
        dependencyIds.push(providerPluginId);
      }
      const dependents = dependentsByPluginId.get(providerPluginId) ?? new Set<string>();
      dependents.add(manifest.id);
      dependentsByPluginId.set(providerPluginId, dependents);
    }
    dependenciesByPluginId.set(manifest.id, Object.freeze(dependencyIds));
  }

  const pluginIds = manifests.map((manifest) => manifest.id);
  const cycle = dependencyCycle(pluginIds, dependenciesByPluginId);
  if (cycle !== null) return failed(new PluginDependencyCycleError(cycle));
  const dependencyOrder = topologicalOrder(pluginIds, dependenciesByPluginId);
  const reverseDependencyOrder = Object.freeze([...dependencyOrder].reverse());

  const commandHandlers = new Map<string, PluginCommandHandler>();
  const viewRenderers = new Map<string, PluginViewRenderer<RenderedView>>();
  const publishedServices = new Map<string, PublishedPluginService>();
  let lifecycle: PluginHostLifecycle = 'open';
  let disposalPromise: Promise<readonly PluginDeactivationError[]> | null = null;
  let transitionTail: Promise<void> | null = null;

  const enqueueTransition = <Value>(
    transition: () => Value | Promise<Value>,
  ): Promise<Value> => {
    const result =
      transitionTail === null
        ? Promise.resolve(transition())
        : transitionTail.then(transition);
    const completion = result.then(
      () => undefined,
      () => undefined,
    );
    transitionTail = completion;
    void completion.then(() => {
      if (transitionTail === completion) transitionTail = null;
    });
    return result;
  };

  const unavailableDependency = (
    pluginId: string,
  ): PluginDependencyUnavailableError | null => {
    const record = records.get(pluginId);
    if (record === undefined) return null;
    for (const serviceId of record.module.manifest.requires) {
      const providerPluginId = serviceProviders.get(serviceId);
      if (providerPluginId === undefined) continue;
      const providerRecord = records.get(providerPluginId);
      if (providerRecord === undefined) continue;
      if (!stateIsEnabled(providerRecord.state) || providerRecord.state.status === 'failed') {
        return new PluginDependencyUnavailableError(
          pluginId,
          serviceId,
          providerPluginId,
          providerFailureTag(providerRecord.state),
        );
      }
      const transitiveFailure = unavailableDependency(providerPluginId);
      if (transitiveFailure !== null) return transitiveFailure;
    }
    return null;
  };

  const canAttemptActivation = (pluginId: string): boolean => {
    const record = records.get(pluginId);
    return (
      record !== undefined &&
      stateIsEnabled(record.state) &&
      record.state.status !== 'failed' &&
      unavailableDependency(pluginId) === null
    );
  };

  const unpublishPlugin = (
    pluginId: string,
    record: PluginRecord<RenderedView>,
  ): void => {
    for (const command of record.module.manifest.contributes.commands) {
      commandHandlers.delete(command.id);
    }
    for (const view of record.module.manifest.contributes.views) {
      viewRenderers.delete(view.id);
    }
    for (const serviceId of record.module.manifest.provides) {
      if (publishedServices.get(serviceId)?.providerPluginId === pluginId) {
        publishedServices.delete(serviceId);
      }
    }
  };

  const drainResources = async (
    pluginId: string,
    resources: PluginRuntimeResources,
  ): Promise<PluginDeactivationError | null> => {
    try {
      return cleanupFailure(pluginId, await resources.scope.drain());
    } finally {
      resources.closeServiceAccess();
    }
  };

  const dependencyStillActive = (
    pluginId: string,
  ): PluginDependencyUnavailableError | null => {
    const record = records.get(pluginId);
    if (record === undefined) return null;
    for (const serviceId of record.module.manifest.requires) {
      const providerPluginId = serviceProviders.get(serviceId);
      if (providerPluginId === undefined) continue;
      const providerRecord = records.get(providerPluginId);
      if (
        providerRecord === undefined ||
        !stateIsEnabled(providerRecord.state) ||
        providerRecord.state.status !== 'active' ||
        !publishedServices.has(serviceId)
      ) {
        return new PluginDependencyUnavailableError(
          pluginId,
          serviceId,
          providerPluginId,
          providerRecord === undefined ? null : providerFailureTag(providerRecord.state),
        );
      }
    }
    return null;
  };

  const activatePlugin = async (pluginId: string): Promise<PluginResult<void>> => {
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const record = records.get(pluginId);
    if (record === undefined) return failed(new PluginNotFoundError(pluginId));
    if (!stateIsEnabled(record.state)) return failed(new PluginDisabledError(pluginId));
    if (record.state.status === 'active') return succeeded(undefined);
    if (record.state.status === 'failed') return failed(record.state.error);
    if (
      record.state.status === 'activating' ||
      record.state.status === 'disabling-activation'
    ) {
      return record.state.activation;
    }
    if (record.state.status === 'deactivating') {
      await record.state.deactivation;
      return activatePlugin(pluginId);
    }
    if (record.state.status === 'deactivation-requested') {
      return failed(new PluginDisabledError(pluginId));
    }

    const activation = Promise.resolve().then(async (): Promise<PluginResult<void>> => {
      const localHandlers = new Map<string, PluginCommandHandler>();
      const localViewRenderers = new Map<string, PluginViewRenderer<RenderedView>>();
      const localServices = new Map<string, PublishedPluginService>();
      const scope = createEffectScope();
      let activationOpen = true;
      let serviceAccessOpen = true;
      const declaredCommands = new Set(
        record.module.manifest.contributes.commands.map((command) => command.id),
      );
      const declaredViews = new Set(
        record.module.manifest.contributes.views.map((view) => view.id),
      );
      const declaredProvidedServices = new Set(record.module.manifest.provides);
      const declaredRequiredServices = new Set(record.module.manifest.requires);
      const assertActivationOpen = (): void => {
        if (!activationOpen) {
          throw new PluginActivationContextClosedError(pluginId);
        }
      };
      const assertServiceAccessOpen = (): void => {
        if (!serviceAccessOpen) {
          throw new PluginActivationContextClosedError(pluginId);
        }
      };
      const closeActivation = (): void => {
        activationOpen = false;
        scope.close();
      };
      const resources: PluginRuntimeResources = {
        scope,
        closeServiceAccess: () => {
          serviceAccessOpen = false;
        },
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
        provideService(key, value) {
          assertActivationOpen();
          if (!declaredProvidedServices.has(key.id)) {
            throw new PluginServiceAccessError(pluginId, key.id, 'provide', 'undeclared');
          }
          if (localServices.has(key.id)) {
            throw new PluginServiceAccessError(pluginId, key.id, 'provide', 'duplicate');
          }
          localServices.set(key.id, {
            key,
            providerPluginId: pluginId,
            value,
          });
        },
        getService<Value>(key: PluginServiceKey<Value>): Value {
          assertServiceAccessOpen();
          if (!declaredRequiredServices.has(key.id)) {
            throw new PluginServiceAccessError(pluginId, key.id, 'consume', 'undeclared');
          }
          const service = publishedServices.get(key.id);
          if (service === undefined) {
            throw new PluginServiceAccessError(pluginId, key.id, 'consume', 'unavailable');
          }
          if (service.key !== key) {
            throw new PluginServiceAccessError(pluginId, key.id, 'consume', 'key-mismatch');
          }
          // SAFETY: key identity couples this stored value to PluginServiceKey<Value>.
          return service.value as Value;
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

      const rollback = async (
        resultError: PluginHostError,
        cacheActivationFailure: boolean,
      ): Promise<PluginResult<void>> => {
        closeActivation();
        const cleanupError = await drainResources(pluginId, resources);
        const disableRequested = stateRequestsDisable(record.state);
        if (cleanupError !== null) {
          record.state = { status: 'disabled' };
          if (disableRequested || lifecycle !== 'open') {
            record.pendingDeactivationErrors.push(cleanupError);
          }
          return failed(cleanupError);
        }
        if (lifecycle !== 'open') {
          record.state = { status: 'disabled' };
          return failed(new PluginHostDisposedError());
        }
        if (disableRequested) {
          record.state = { status: 'disabled' };
          return failed(new PluginDisabledError(pluginId));
        }
        if (cacheActivationFailure && resultError instanceof PluginActivationError) {
          record.state = { status: 'failed', error: resultError };
        } else {
          record.state = { status: 'inactive' };
        }
        return failed(resultError);
      };

      try {
        const activationResult = record.module.activate(context);
        if (!(activationResult instanceof Promise)) activationOpen = false;
        const disposable = (await activationResult) ?? null;
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
        for (const serviceId of declaredProvidedServices) {
          if (!localServices.has(serviceId)) {
            throw new Error(`Plugin ${pluginId} did not provide service ${serviceId}.`);
          }
        }

        const dependencyFailure = dependencyStillActive(pluginId);
        if (dependencyFailure !== null) {
          return await rollback(dependencyFailure, false);
        }
        if (stateRequestsDisable(record.state)) {
          return await rollback(new PluginDisabledError(pluginId), false);
        }
        if (lifecycle !== 'open') {
          return await rollback(new PluginHostDisposedError(), false);
        }

        for (const [commandId, handler] of localHandlers) {
          commandHandlers.set(commandId, handler);
        }
        for (const [viewId, renderer] of localViewRenderers) {
          viewRenderers.set(viewId, renderer);
        }
        for (const [serviceId, service] of localServices) {
          publishedServices.set(serviceId, service);
        }
        record.state = { status: 'active', resources };
        return succeeded(undefined);
      } catch (cause) {
        const activationError =
          cause instanceof PluginActivationError
            ? cause
            : new PluginActivationError(pluginId, cause);
        return rollback(activationError, true);
      }
    });

    record.state = { status: 'activating', activation };
    return activation;
  };

  const activatePluginGraph = async (
    pluginId: string,
  ): Promise<PluginResult<void>> => {
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const record = records.get(pluginId);
    if (record === undefined) return failed(new PluginNotFoundError(pluginId));
    if (!stateIsEnabled(record.state)) return failed(new PluginDisabledError(pluginId));

    for (const serviceId of record.module.manifest.requires) {
      const providerPluginId = serviceProviders.get(serviceId);
      if (providerPluginId === undefined) {
        return failed(
          new PluginDependencyUnavailableError(pluginId, serviceId, 'unregistered'),
        );
      }
      const providerRecord = records.get(providerPluginId);
      if (
        providerRecord === undefined ||
        !stateIsEnabled(providerRecord.state) ||
        providerRecord.state.status === 'failed'
      ) {
        return failed(
          new PluginDependencyUnavailableError(
            pluginId,
            serviceId,
            providerPluginId,
            providerRecord === undefined ? null : providerFailureTag(providerRecord.state),
          ),
        );
      }
      const providerActivation = await activatePluginGraph(providerPluginId);
      if (!providerActivation.ok) {
        return failed(
          new PluginDependencyUnavailableError(
            pluginId,
            serviceId,
            providerPluginId,
            providerActivation.error._tag,
          ),
        );
      }
      if (!publishedServices.has(serviceId)) {
        return failed(
          new PluginDependencyUnavailableError(pluginId, serviceId, providerPluginId),
        );
      }
    }

    return activatePlugin(pluginId);
  };

  const deactivatePlugin = async (
    pluginId: string,
    disableWhenComplete: boolean,
  ): Promise<PluginDeactivationError | null> => {
    const record = records.get(pluginId);
    if (record === undefined) return null;

    if (record.pendingDeactivationErrors.length > 0) {
      const pendingError = record.pendingDeactivationErrors.shift() ?? null;
      record.state = disableWhenComplete
        ? { status: 'disabled' }
        : { status: 'inactive' };
      return pendingError;
    }
    if (
      record.state.status === 'activating' ||
      record.state.status === 'disabling-activation'
    ) {
      await record.state.activation;
      return deactivatePlugin(pluginId, disableWhenComplete);
    }
    if (record.state.status === 'deactivating') {
      if (disableWhenComplete && !record.state.disableWhenComplete) {
        record.state = {
          status: 'deactivating',
          deactivation: record.state.deactivation,
          disableWhenComplete: true,
        };
      }
      return record.state.deactivation;
    }
    if (record.state.status === 'disabled') return null;
    if (record.state.status === 'failed' || record.state.status === 'inactive') {
      record.state = disableWhenComplete
        ? { status: 'disabled' }
        : { status: 'inactive' };
      return null;
    }

    const resources = record.state.resources;
    unpublishPlugin(pluginId, record);
    const deactivation = Promise.resolve().then(async () => {
      const cleanupError = await drainResources(pluginId, resources);
      const currentState = record.state;
      const shouldDisable =
        disableWhenComplete ||
        (currentState.status === 'deactivating' && currentState.disableWhenComplete);
      record.state = shouldDisable
        ? { status: 'disabled' }
        : { status: 'inactive' };
      return cleanupError;
    });
    record.state = {
      status: 'deactivating',
      deactivation,
      disableWhenComplete,
    };
    return deactivation;
  };

  const affectedPluginIds = (pluginId: string): ReadonlySet<string> => {
    const affected = new Set<string>();
    const visit = (currentPluginId: string): void => {
      if (affected.has(currentPluginId)) return;
      affected.add(currentPluginId);
      for (const dependentId of dependentsByPluginId.get(currentPluginId) ?? []) {
        visit(dependentId);
      }
    };
    visit(pluginId);
    return affected;
  };

  const deactivateCascade = async (
    pluginId: string,
  ): Promise<readonly PluginDeactivationError[]> => {
    const affected = affectedPluginIds(pluginId);
    const failures: PluginDeactivationError[] = [];
    for (const affectedPluginId of reverseDependencyOrder) {
      if (!affected.has(affectedPluginId)) continue;
      const record = records.get(affectedPluginId);
      if (record === undefined) continue;
      const cleanupError = await deactivatePlugin(
        affectedPluginId,
        affectedPluginId === pluginId || stateRequestsDisable(record.state),
      );
      if (cleanupError !== null) failures.push(cleanupError);
    }
    return Object.freeze(failures);
  };

  const reconcileDemandedPlugins = async (): Promise<PluginResult<void>> => {
    let firstFailure: PluginHostError | null = null;
    for (const pluginId of dependencyOrder) {
      const record = records.get(pluginId);
      if (
        record === undefined ||
        !record.demanded ||
        record.state.status === 'active' ||
        !canAttemptActivation(pluginId)
      ) {
        continue;
      }
      const activation = await activatePluginGraph(pluginId);
      if (!activation.ok && firstFailure === null) {
        firstFailure = activation.error;
      }
    }
    return firstFailure === null ? succeeded(undefined) : failed(firstFailure);
  };

  const executeCommand = async (commandId: string): Promise<PluginResult<void>> => {
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const pluginId = commandOwners.get(commandId);
    if (pluginId === undefined) {
      return failed(new PluginCommandNotFoundError(commandId));
    }
    const record = records.get(pluginId);
    if (record !== undefined) record.demanded = true;
    const activation = await enqueueTransition(() => activatePluginGraph(pluginId));
    if (!activation.ok) return activation;
    if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
    const dependencyFailure = unavailableDependency(pluginId);
    if (dependencyFailure !== null) return failed(dependencyFailure);
    const currentRecord = records.get(pluginId);
    if (currentRecord === undefined || !stateIsEnabled(currentRecord.state)) {
      return failed(new PluginDisabledError(pluginId));
    }
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
      return manifests.flatMap((manifest) => {
        const record = records.get(manifest.id);
        return record !== undefined &&
          stateIsEnabled(record.state) &&
          unavailableDependency(manifest.id) === null
          ? manifest.contributes.views
          : [];
      });
    },
    isPluginEnabled(pluginId) {
      const record = records.get(pluginId);
      return record !== undefined && stateIsEnabled(record.state);
    },
    activateStartupPlugins() {
      if (lifecycle !== 'open') {
        return Promise.resolve(
          Object.freeze<PluginHostError[]>([new PluginHostDisposedError()]),
        );
      }
      const startupManifests = manifests.filter((manifest) =>
        manifest.activationEvents.some(
          (activationEvent) => activationEvent.event === 'startup',
        ),
      );
      for (const manifest of startupManifests) {
        const record = records.get(manifest.id);
        if (record !== undefined) record.demanded = true;
      }
      return enqueueTransition(async () => {
        if (lifecycle !== 'open') {
          return Object.freeze<PluginHostError[]>([
            new PluginHostDisposedError(),
          ]);
        }
        const errors: PluginHostError[] = [];
        for (const manifest of startupManifests) {
          const record = records.get(manifest.id);
          if (record === undefined || !stateIsEnabled(record.state)) continue;
          const activation = await activatePluginGraph(manifest.id);
          if (!activation.ok) errors.push(activation.error);
        }
        return Object.freeze(errors);
      });
    },
    enablePlugin(pluginId) {
      if (lifecycle !== 'open') {
        return Promise.resolve(failed(new PluginHostDisposedError()));
      }
      if (!records.has(pluginId)) {
        return Promise.resolve(failed(new PluginNotFoundError(pluginId)));
      }
      return enqueueTransition(async () => {
        if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
        const record = records.get(pluginId);
        if (record === undefined) return failed(new PluginNotFoundError(pluginId));
        if (record.state.status === 'deactivating') {
          await record.state.deactivation;
        }
        if (
          record.state.status === 'disabled' ||
          record.state.status === 'failed'
        ) {
          record.state = { status: 'inactive' };
        }
        if (
          record.module.manifest.activationEvents.some(
            (activationEvent) => activationEvent.event === 'startup',
          )
        ) {
          record.demanded = true;
        }
        return reconcileDemandedPlugins();
      });
    },
    disablePlugin(pluginId) {
      if (lifecycle !== 'open') {
        return Promise.resolve(failed(new PluginHostDisposedError()));
      }
      const record = records.get(pluginId);
      if (record === undefined) {
        return Promise.resolve(failed(new PluginNotFoundError(pluginId)));
      }
      requestPluginDisable(record);
      return enqueueTransition(async () => {
        if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
        const failures = await deactivateCascade(pluginId);
        if (failures.length === 0) return succeeded(undefined);
        if (failures.length === 1 && failures[0]?.pluginId === pluginId) {
          return failed(failures[0]);
        }
        return failed(new PluginCascadeDeactivationError(pluginId, failures));
      });
    },
    async renderView(viewId) {
      if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      const pluginId = viewOwners.get(viewId);
      if (pluginId === undefined) return failed(new PluginViewNotFoundError(viewId));
      const record = records.get(pluginId);
      if (record !== undefined) record.demanded = true;
      const activation = await enqueueTransition(() => activatePluginGraph(pluginId));
      if (!activation.ok) return activation;
      if (lifecycle !== 'open') return failed(new PluginHostDisposedError());
      const dependencyFailure = unavailableDependency(pluginId);
      if (dependencyFailure !== null) return failed(dependencyFailure);
      const currentRecord = records.get(pluginId);
      if (currentRecord === undefined || !stateIsEnabled(currentRecord.state)) {
        return failed(new PluginDisabledError(pluginId));
      }
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
      for (const record of records.values()) requestPluginDisable(record);
      disposalPromise = enqueueTransition(async () => {
        const errors: PluginDeactivationError[] = [];
        for (const pluginId of reverseDependencyOrder) {
          const cleanupError = await deactivatePlugin(pluginId, true);
          if (cleanupError !== null) errors.push(cleanupError);
        }
        commandHandlers.clear();
        viewRenderers.clear();
        publishedServices.clear();
        lifecycle = 'disposed';
        return Object.freeze(errors);
      });
      return disposalPromise;
    },
  };

  return succeeded(host);
}

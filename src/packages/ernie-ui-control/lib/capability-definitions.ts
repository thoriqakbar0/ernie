import {
  isJsonBoolean,
  isJsonNumber,
  isJsonRecord,
  isJsonString,
  parseJsonValue,
  type JsonValue,
} from '../../json-value/index.js';

/** Narrowest supported desktop sidebar width in pixels. */
export const ernieUiSidebarMinimumWidth = 192;

/** Default desktop sidebar width in pixels. */
export const ernieUiSidebarDefaultWidth = 280;

/** Widest supported desktop sidebar width in pixels. */
export const ernieUiSidebarMaximumWidth = 384;

/** One color appearance accepted by Ernie's UI-control protocol. */
export type ErnieUiColorTheme = 'dark' | 'light';

/** One parsed renderer request that changes only sidebar presentation. */
export type ErnieUiSidebarRequest =
  | Readonly<{ open: boolean; type: 'set-sidebar-open' }>
  | Readonly<{ type: 'set-sidebar-width'; width: number }>;

type CliSuccessOutput<Command extends object> =
  | Readonly<{ format: (command: Command) => string; kind: 'message' }>
  | Readonly<{ kind: 'manifest' }>;

type ParsedCliCommand<Command extends object> =
  | Readonly<{ command: Command; kind: 'manifest' }>
  | Readonly<{ command: Command; kind: 'message'; message: string }>;

type UiControlCommandDefinition<Command extends object> = Readonly<{
  id: string;
  inputConstraints: readonly ErnieUiControlInputConstraint[];
  parseArguments: (arguments_: readonly string[]) => Command | null;
  parseRequest: (value: JsonValue | undefined) => Command | null;
  path: readonly string[];
  resultDescription: string;
  successOutput: CliSuccessOutput<Command>;
  usageArguments: readonly string[];
}>;

function defineUiControlCommand<const Command extends object>(
  definition: UiControlCommandDefinition<Command>,
): UiControlCommandDefinition<Command> &
  Readonly<{
    parseCli: (
      arguments_: readonly string[],
    ) => ParsedCliCommand<Command> | null;
  }> {
  return {
    ...definition,
    parseCli: (arguments_) => {
      const command = definition.parseArguments(arguments_);
      if (command === null) return null;
      return definition.successOutput.kind === 'manifest'
        ? { command, kind: 'manifest' }
        : {
            command,
            kind: 'message',
            message: definition.successOutput.format(command),
          };
    },
  };
}

const windowCapabilityDefinition = {
  commands: [
    defineUiControlCommand<Readonly<{ type: 'focus' }>>({
      id: 'focus',
      inputConstraints: [],
      parseArguments: (arguments_) =>
        arguments_.length === 0 ? { type: 'focus' } : null,
      parseRequest: (value) =>
        isJsonRecord(value) &&
        Object.keys(value).length === 1 &&
        value.type === 'focus'
          ? { type: 'focus' }
          : null,
      path: ['ui', 'focus'],
      resultDescription: 'The Ernie window receives focus.',
      successOutput: {
        format: () => 'Ernie focused.',
        kind: 'message',
      },
      usageArguments: [],
    }),
  ],
  id: 'window',
  summary: 'Control the Ernie application window.',
} as const;

const themeCapabilityDefinition = {
  commands: [
    defineUiControlCommand<
      Readonly<{ theme: ErnieUiColorTheme; type: 'set-theme' }>
    >({
      id: 'set-theme',
      inputConstraints: [
        { kind: 'enum', name: 'theme', values: ['dark', 'light'] },
      ],
      parseArguments: (arguments_) => {
        const theme = arguments_[0];
        return arguments_.length === 1 &&
          (theme === 'dark' || theme === 'light')
          ? { theme, type: 'set-theme' }
          : null;
      },
      parseRequest: (value) =>
        isJsonRecord(value) &&
        Object.keys(value).length === 2 &&
        value.type === 'set-theme' &&
        (value.theme === 'dark' || value.theme === 'light')
          ? { theme: value.theme, type: 'set-theme' }
          : null,
      path: ['ui', 'theme'],
      resultDescription: 'The requested color theme is applied.',
      successOutput: {
        format: (command) => `Ernie theme set to ${command.theme}.`,
        kind: 'message',
      },
      usageArguments: ['<dark|light>'],
    }),
  ],
  id: 'theme',
  summary: 'Control the Ernie color appearance.',
} as const;

const sidebarCapabilityDefinition = {
  commands: [
    defineUiControlCommand<
      Readonly<{ open: boolean; type: 'set-sidebar-open' }>
    >({
      id: 'set-sidebar-open',
      inputConstraints: [
        {
          kind: 'enum',
          name: 'visibility',
          values: ['show', 'hide'],
        },
      ],
      parseArguments: (arguments_) => {
        const visibility = arguments_[0];
        return arguments_.length === 1 &&
          (visibility === 'show' || visibility === 'hide')
          ? { open: visibility === 'show', type: 'set-sidebar-open' }
          : null;
      },
      parseRequest: (value) =>
        isJsonRecord(value) &&
        Object.keys(value).length === 2 &&
        value.type === 'set-sidebar-open' &&
        isJsonBoolean(value.open)
          ? { open: value.open, type: 'set-sidebar-open' }
          : null,
      path: ['ui', 'sidebar'],
      resultDescription: 'The requested sidebar visibility is applied.',
      successOutput: {
        format: (command) =>
          `Ernie sidebar ${command.open ? 'shown' : 'hidden'}.`,
        kind: 'message',
      },
      usageArguments: ['<show|hide>'],
    }),
    defineUiControlCommand<
      Readonly<{ type: 'set-sidebar-width'; width: number }>
    >({
      id: 'set-sidebar-width',
      inputConstraints: [
        {
          kind: 'integer',
          maximum: ernieUiSidebarMaximumWidth,
          minimum: ernieUiSidebarMinimumWidth,
          name: 'width',
        },
      ],
      parseArguments: (arguments_) => {
        const widthArgument = arguments_[0] ?? '';
        if (arguments_.length !== 1 || !/^\d+$/u.test(widthArgument)) {
          return null;
        }
        const width = Number(widthArgument);
        return Number.isInteger(width) &&
          width >= ernieUiSidebarMinimumWidth &&
          width <= ernieUiSidebarMaximumWidth
          ? { type: 'set-sidebar-width', width }
          : null;
      },
      parseRequest: (value) =>
        isJsonRecord(value) &&
        Object.keys(value).length === 2 &&
        value.type === 'set-sidebar-width' &&
        isJsonNumber(value.width) &&
        Number.isInteger(value.width) &&
        value.width >= ernieUiSidebarMinimumWidth &&
        value.width <= ernieUiSidebarMaximumWidth
          ? { type: 'set-sidebar-width', width: value.width }
          : null,
      path: ['ui', 'sidebar', 'width'],
      resultDescription: 'The requested sidebar width is applied.',
      successOutput: {
        format: (command) =>
          `Ernie sidebar width set to ${command.width}px.`,
        kind: 'message',
      },
      usageArguments: [
        `<${ernieUiSidebarMinimumWidth}..${ernieUiSidebarMaximumWidth}>`,
      ],
    }),
  ],
  id: 'sidebar',
  summary: 'Control the Ernie sidebar presentation.',
} as const;

const capabilitiesCommandDefinition = defineUiControlCommand<
  Readonly<{ type: 'list-capabilities' }>
>({
  id: 'list-capabilities',
  inputConstraints: [],
  parseArguments: (arguments_) =>
    arguments_.length === 0 ? { type: 'list-capabilities' } : null,
  parseRequest: (value) =>
    isJsonRecord(value) &&
    Object.keys(value).length === 1 &&
    value.type === 'list-capabilities'
      ? { type: 'list-capabilities' }
      : null,
  path: ['ui', 'capabilities'],
  resultDescription: 'A versioned manifest of built-in UI capabilities.',
  successOutput: { kind: 'manifest' },
  usageArguments: [],
});

/** Authoritative definitions for Ernie's built-in UI capabilities. */
export const ernieUiControlCapabilityDefinitions = [
  {
    commands: [capabilitiesCommandDefinition],
    id: 'discovery',
    summary: 'Inspect Ernie built-in UI controls.',
  },
  windowCapabilityDefinition,
  themeCapabilityDefinition,
  sidebarCapabilityDefinition,
] as const;

type ErnieUiControlCommandDefinition =
  (typeof ernieUiControlCapabilityDefinitions)[number]['commands'][number];

/** One request derived from Ernie's built-in capability definitions. */
export type ErnieUiControlRequest = NonNullable<
  ReturnType<ErnieUiControlCommandDefinition['parseRequest']>
>;

/** One UI-changing command accepted by Ernie's local UI-control protocol. */
export type ErnieUiControlCommand = Exclude<
  ErnieUiControlRequest,
  Readonly<{ type: 'list-capabilities' }>
>;

/** Stable identifier for one declared built-in UI capability. */
export type ErnieUiControlCapabilityId =
  (typeof ernieUiControlCapabilityDefinitions)[number]['id'];

/** Current runtime availability reported for one declared capability. */
export type ErnieUiControlCapabilityAvailability = Readonly<{
  status: 'available' | 'unavailable';
}>;

/** One machine-readable input constraint for a UI control command. */
export type ErnieUiControlInputConstraint =
  | Readonly<{
      kind: 'enum';
      name: string;
      values: readonly string[];
    }>
  | Readonly<{
      kind: 'integer';
      maximum: number;
      minimum: number;
      name: string;
    }>;

/** One public command declared by a manifest capability entry. */
export type ErnieUiControlManifestCommand = Readonly<{
  id: string;
  inputConstraints: readonly ErnieUiControlInputConstraint[];
  path: readonly string[];
  resultDescription: string;
}>;

/** One declared built-in capability and its current availability. */
export type ErnieUiControlManifestCapability = Readonly<{
  availability: ErnieUiControlCapabilityAvailability;
  commands: readonly ErnieUiControlManifestCommand[];
  id: string;
  source: 'built-in';
  summary: string;
}>;

/** Versioned machine-readable description of Ernie's built-in UI controls. */
export type ErnieUiControlCapabilityManifest = Readonly<{
  capabilities: readonly ErnieUiControlManifestCapability[];
  schemaVersion: 1;
}>;

/** Serializable declaration registered for one built-in UI capability. */
export type ErnieUiControlCapabilityRegistration = Readonly<{
  commands: readonly ErnieUiControlManifestCommand[];
  id: string;
  summary: string;
}>;

/** A capability registration does not satisfy the manifest contract. */
export class InvalidUiCapabilityDefinitionError extends Error {
  readonly _tag = 'InvalidUiCapabilityDefinitionError';
  readonly code = 'invalid_definition';

  constructor(cause?: unknown) {
    super('UI capability definition is invalid.', { cause });
  }
}

/** Two built-in capabilities attempted to own one stable identifier. */
export class DuplicateUiCapabilityIdError extends Error {
  readonly _tag = 'DuplicateUiCapabilityIdError';
  readonly code = 'duplicate_capability_id';

  constructor(readonly capabilityId: string) {
    super(`UI capability "${capabilityId}" is already registered.`);
  }
}

/** Two built-in commands attempted to own one stable identifier. */
export class DuplicateUiCommandIdError extends Error {
  readonly _tag = 'DuplicateUiCommandIdError';
  readonly code = 'duplicate_command_id';

  constructor(readonly commandId: string) {
    super(`UI command identifier "${commandId}" is already registered.`);
  }
}

/** Two built-in commands attempted to own one CLI path. */
export class DuplicateUiCommandPathError extends Error {
  readonly _tag = 'DuplicateUiCommandPathError';
  readonly code = 'duplicate_command_path';

  constructor(readonly commandPath: readonly string[]) {
    super(`UI command path "${commandPath.join(' ')}" is already registered.`);
  }
}

/** Built-in capability registration continued after startup closed. */
export class UiCapabilityRegistryClosedError extends Error {
  readonly _tag = 'UiCapabilityRegistryClosedError';
  readonly code = 'registry_closed';

  constructor() {
    super('UI capability registration is closed.');
  }
}

/** Expected failure while registering one built-in UI capability. */
export type ErnieUiControlCapabilityRegistrationError =
  | InvalidUiCapabilityDefinitionError
  | DuplicateUiCapabilityIdError
  | DuplicateUiCommandIdError
  | DuplicateUiCommandPathError
  | UiCapabilityRegistryClosedError;

/** Expected outcome of registering one built-in UI capability. */
export type ErnieUiControlCapabilityRegistrationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      error: ErnieUiControlCapabilityRegistrationError;
      ok: false;
    }>;

/** Closed built-in capability catalog used for runtime discovery. */
export interface ErnieUiControlCapabilityCatalog {
  /** Project registered definitions with their current runtime availability. */
  readonly createManifest: (
    readAvailability: (
      capabilityId: string,
    ) => ErnieUiControlCapabilityAvailability,
  ) => ErnieUiControlCapabilityManifest;
}

/** Mutable startup registry for declared built-in UI capabilities. */
export interface ErnieUiControlCapabilityRegistry {
  /** Close registration after built-in startup completes. */
  readonly close: () => ErnieUiControlCapabilityCatalog;
  /** Register one declaration or return a deterministic conflict. */
  readonly register: (
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The registry owns the runtime definition boundary and parses the value before storing it.
    definition: unknown,
  ) => ErnieUiControlCapabilityRegistrationResult;
}

const stableIdentifierPattern = /^[a-z][a-z0-9-]*$/u;

function parseCapabilityRegistration(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parser owns the runtime registration boundary and returns an immutable definition.
  value: unknown,
):
  | Readonly<{
      ok: true;
      value: ErnieUiControlCapabilityRegistration;
    }>
  | Readonly<{
      error: InvalidUiCapabilityDefinitionError;
      ok: false;
    }> {
  let parsed: JsonValue | undefined;
  try {
    parsed = parseJsonValue(value);
  } catch (cause) {
    return { error: new InvalidUiCapabilityDefinitionError(cause), ok: false };
  }
  if (
    !isJsonRecord(parsed) ||
    Object.keys(parsed).length !== 3 ||
    !isJsonString(parsed.id) ||
    !stableIdentifierPattern.test(parsed.id) ||
    !isJsonString(parsed.summary) ||
    parsed.summary.trim().length === 0 ||
    !Array.isArray(parsed.commands)
  ) {
    return { error: new InvalidUiCapabilityDefinitionError(), ok: false };
  }
  const commands = parsed.commands.map(parseManifestCommand);
  if (
    commands.length === 0 ||
    commands.some((command) => command === null)
  ) {
    return { error: new InvalidUiCapabilityDefinitionError(), ok: false };
  }
  return {
    ok: true,
    value: {
      commands: commands.flatMap((command) =>
        command === null ? [] : [command],
      ),
      id: parsed.id,
      summary: parsed.summary,
    },
  };
}

function snapshotManifestCommand(
  command: ErnieUiControlManifestCommand,
): ErnieUiControlManifestCommand {
  return {
    id: command.id,
    inputConstraints: command.inputConstraints.map((constraint) =>
      constraint.kind === 'enum'
        ? { ...constraint, values: [...constraint.values] }
        : { ...constraint },
    ),
    path: [...command.path],
    resultDescription: command.resultDescription,
  };
}

function snapshotCapabilityRegistration(
  definition: ErnieUiControlCapabilityRegistration,
): ErnieUiControlCapabilityRegistration {
  return {
    commands: definition.commands.map(snapshotManifestCommand),
    id: definition.id,
    summary: definition.summary,
  };
}

/** Create an empty registry for built-in UI capability startup. */
export function createErnieUiControlCapabilityRegistry(): ErnieUiControlCapabilityRegistry {
  const capabilityIds = new Set<string>();
  const commandIds = new Set<string>();
  const commandPaths = new Set<string>();
  const registrations: ErnieUiControlCapabilityRegistration[] = [];
  let closed = false;
  return {
    close: () => {
      closed = true;
      const definitions = registrations.map(snapshotCapabilityRegistration);
      return {
        createManifest: (readAvailability) => ({
          capabilities: definitions.map((definition) => ({
            availability: readAvailability(definition.id),
            commands: definition.commands.map(snapshotManifestCommand),
            id: definition.id,
            source: 'built-in',
            summary: definition.summary,
          })),
          schemaVersion: 1,
        }),
      };
    },
    register: (value) => {
      if (closed) {
        return {
          error: new UiCapabilityRegistryClosedError(),
          ok: false,
        };
      }
      const parsed = parseCapabilityRegistration(value);
      if (!parsed.ok) return parsed;
      const definition = parsed.value;
      if (capabilityIds.has(definition.id)) {
        return {
          error: new DuplicateUiCapabilityIdError(definition.id),
          ok: false,
        };
      }
      const pendingCommandIds = new Set<string>();
      const pendingPaths = new Set<string>();
      for (const command of definition.commands) {
        if (commandIds.has(command.id) || pendingCommandIds.has(command.id)) {
          return {
            error: new DuplicateUiCommandIdError(command.id),
            ok: false,
          };
        }
        const pathKey = command.path.join('\0');
        if (commandPaths.has(pathKey) || pendingPaths.has(pathKey)) {
          return {
            error: new DuplicateUiCommandPathError(command.path),
            ok: false,
          };
        }
        pendingCommandIds.add(command.id);
        pendingPaths.add(pathKey);
      }
      capabilityIds.add(definition.id);
      for (const commandId of pendingCommandIds) commandIds.add(commandId);
      for (const pathKey of pendingPaths) commandPaths.add(pathKey);
      registrations.push(snapshotCapabilityRegistration(definition));
      return { ok: true };
    },
  };
}

/**
 * Register and close Ernie's authoritative built-in capability definitions.
 *
 * @throws {ErnieUiControlCapabilityRegistrationError} when checked-in
 * definitions violate their invariant.
 */
export function createErnieUiControlBuiltInCapabilityCatalog(): ErnieUiControlCapabilityCatalog {
  const registry = createErnieUiControlCapabilityRegistry();
  for (const capability of ernieUiControlCapabilityDefinitions) {
    const result = registry.register({
      commands: capability.commands.map((command) => ({
        id: command.id,
        inputConstraints: command.inputConstraints,
        path: command.path,
        resultDescription: command.resultDescription,
      })),
      id: capability.id,
      summary: capability.summary,
    });
    if (!result.ok) throw result.error;
  }
  return registry.close();
}

/** Runnable projection of one command from a built-in capability definition. */
export type ErnieUiControlRunnableCommandDefinition = Readonly<{
  id: string;
  parseCli: (
    arguments_: readonly string[],
  ) => ParsedCliCommand<ErnieUiControlRequest> | null;
  parseRequest: (value: JsonValue | undefined) => ErnieUiControlRequest | null;
  path: readonly string[];
  usageArguments: readonly string[];
}>;

/** All built-in commands projected from the authoritative capability list. */
export const ernieUiControlCommandDefinitions:
  readonly ErnieUiControlRunnableCommandDefinition[] =
  ernieUiControlCapabilityDefinitions.flatMap((capability) =>
    capability.commands.map(
      (definition): ErnieUiControlRunnableCommandDefinition => ({
        id: definition.id,
        parseCli: (arguments_) => definition.parseCli(arguments_),
        parseRequest: (value) => definition.parseRequest(value),
        path: definition.path,
        usageArguments: definition.usageArguments,
      }),
    ),
  );

function parseStringArray(value: JsonValue | undefined): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => isJsonString(item) && item.trim().length > 0,
    )
  ) {
    return null;
  }
  return value;
}

function parseInputConstraint(
  value: JsonValue | undefined,
): ErnieUiControlInputConstraint | null {
  if (
    !isJsonRecord(value) ||
    !isJsonString(value.name) ||
    !stableIdentifierPattern.test(value.name)
  ) {
    return null;
  }
  if (value.kind === 'enum' && Object.keys(value).length === 3) {
    const values = parseStringArray(value.values);
    return values !== null &&
      values.length > 0 &&
      new Set(values).size === values.length
      ? { kind: 'enum', name: value.name, values }
      : null;
  }
  if (
    value.kind === 'integer' &&
    Object.keys(value).length === 4 &&
    isJsonNumber(value.minimum) &&
    Number.isInteger(value.minimum) &&
    isJsonNumber(value.maximum) &&
    Number.isInteger(value.maximum) &&
    value.minimum <= value.maximum
  ) {
    return {
      kind: 'integer',
      maximum: value.maximum,
      minimum: value.minimum,
      name: value.name,
    };
  }
  return null;
}

function parseManifestCommand(
  value: JsonValue | undefined,
): ErnieUiControlManifestCommand | null {
  if (
    !isJsonRecord(value) ||
    Object.keys(value).length !== 4 ||
    !isJsonString(value.id) ||
    !stableIdentifierPattern.test(value.id) ||
    !isJsonString(value.resultDescription) ||
    value.resultDescription.trim().length === 0
  ) {
    return null;
  }
  const inputConstraints = Array.isArray(value.inputConstraints)
    ? value.inputConstraints.map(parseInputConstraint)
    : null;
  const path = parseStringArray(value.path);
  if (
    inputConstraints === null ||
    inputConstraints.some((constraint) => constraint === null) ||
    new Set(
      inputConstraints.flatMap((constraint) =>
        constraint === null ? [] : [constraint.name],
      ),
    ).size !== inputConstraints.length ||
    path === null ||
    path.length <= 1 ||
    path[0] !== 'ui' ||
    !path.every((segment) => stableIdentifierPattern.test(segment))
  ) {
    return null;
  }
  return {
    id: value.id,
    inputConstraints: inputConstraints.flatMap((constraint) =>
      constraint === null ? [] : [constraint],
    ),
    path,
    resultDescription: value.resultDescription,
  };
}

function parseCapabilityId(
  value: JsonValue | undefined,
): string | null {
  return isJsonString(value) && stableIdentifierPattern.test(value)
    ? value
    : null;
}

function parseManifestCapability(
  value: JsonValue | undefined,
): ErnieUiControlManifestCapability | null {
  if (
    !isJsonRecord(value) ||
    Object.keys(value).length !== 5 ||
    value.source !== 'built-in' ||
    !isJsonString(value.summary) ||
    value.summary.trim().length === 0 ||
    !isJsonRecord(value.availability) ||
    Object.keys(value.availability).length !== 1 ||
    (value.availability.status !== 'available' &&
      value.availability.status !== 'unavailable') ||
    !Array.isArray(value.commands)
  ) {
    return null;
  }
  const id = parseCapabilityId(value.id);
  const commands = value.commands.map(parseManifestCommand);
  if (
    id === null ||
    commands.length === 0 ||
    commands.some((command) => command === null)
  ) {
    return null;
  }
  return {
    availability: { status: value.availability.status },
    commands: commands.flatMap((command) =>
      command === null ? [] : [command],
    ),
    id,
    source: 'built-in',
    summary: value.summary,
  };
}

/** Parse one external value into a safe Capability manifest. */
export function parseErnieUiControlCapabilityManifest(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This function owns the manifest boundary and returns the parsed value.
  value: unknown,
): ErnieUiControlCapabilityManifest | null {
  let parsed: JsonValue | undefined;
  try {
    parsed = parseJsonValue(value);
  } catch {
    return null;
  }
  if (
    !isJsonRecord(parsed) ||
    Object.keys(parsed).length !== 2 ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.capabilities) ||
    parsed.capabilities.length === 0
  ) {
    return null;
  }
  const capabilities = parsed.capabilities.map(parseManifestCapability);
  if (capabilities.some((capability) => capability === null)) return null;
  const registry = createErnieUiControlCapabilityRegistry();
  for (const capability of capabilities) {
    if (capability === null) return null;
    const registration = registry.register({
      commands: capability.commands,
      id: capability.id,
      summary: capability.summary,
    });
    if (!registration.ok) return null;
  }
  return {
    capabilities: capabilities.flatMap((capability) =>
      capability === null ? [] : [capability],
    ),
    schemaVersion: 1,
  };
}

/** Parse one untrusted value through the sidebar capability definition. */
export function parseErnieUiSidebarRequest(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This function owns the renderer IPC boundary and returns the parsed request.
  value: unknown,
): ErnieUiSidebarRequest | null {
  const parsed = parseJsonValue(value);
  for (const commandDefinition of sidebarCapabilityDefinition.commands) {
    const command = commandDefinition.parseRequest(parsed);
    if (command !== null) return command;
  }
  return null;
}

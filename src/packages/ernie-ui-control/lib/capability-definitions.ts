import {
  isJsonBoolean,
  isJsonNumber,
  isJsonRecord,
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

type ParsedCliCommand<Command extends object> = Readonly<{
  command: Command;
  successMessage: string;
}>;

type UiControlCommandDefinition<Command extends object> = Readonly<{
  formatSuccess: (command: Command) => string;
  id: string;
  parseArguments: (arguments_: readonly string[]) => Command | null;
  parseRequest: (value: JsonValue | undefined) => Command | null;
  path: readonly string[];
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
      return command === null
        ? null
        : { command, successMessage: definition.formatSuccess(command) };
    },
  };
}

const windowCapabilityDefinition = {
  commands: [
    defineUiControlCommand<Readonly<{ type: 'focus' }>>({
      formatSuccess: () => 'Ernie focused.',
      id: 'focus',
      parseArguments: (arguments_) =>
        arguments_.length === 0 ? { type: 'focus' } : null,
      parseRequest: (value) =>
        isJsonRecord(value) &&
        Object.keys(value).length === 1 &&
        value.type === 'focus'
          ? { type: 'focus' }
          : null,
      path: ['ui', 'focus'],
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
      formatSuccess: (command) =>
        `Ernie theme set to ${command.theme}.`,
      id: 'set-theme',
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
      formatSuccess: (command) =>
        `Ernie sidebar ${command.open ? 'shown' : 'hidden'}.`,
      id: 'set-sidebar-open',
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
      usageArguments: ['<show|hide>'],
    }),
    defineUiControlCommand<
      Readonly<{ type: 'set-sidebar-width'; width: number }>
    >({
      formatSuccess: (command) =>
        `Ernie sidebar width set to ${command.width}px.`,
      id: 'set-sidebar-width',
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
      usageArguments: [
        `<${ernieUiSidebarMinimumWidth}..${ernieUiSidebarMaximumWidth}>`,
      ],
    }),
  ],
  id: 'sidebar',
  summary: 'Control the Ernie sidebar presentation.',
} as const;

/** Authoritative definitions for Ernie's built-in UI capabilities. */
export const ernieUiControlCapabilityDefinitions = [
  windowCapabilityDefinition,
  themeCapabilityDefinition,
  sidebarCapabilityDefinition,
] as const;

type ErnieUiControlCommandDefinition =
  (typeof ernieUiControlCapabilityDefinitions)[number]['commands'][number];

/** One UI-only command derived from Ernie's built-in capability definitions. */
export type ErnieUiControlCommand = NonNullable<
  ReturnType<ErnieUiControlCommandDefinition['parseRequest']>
>;

/** Runnable projection of one command from a built-in capability definition. */
export type ErnieUiControlRunnableCommandDefinition = Readonly<{
  id: string;
  parseCli: (
    arguments_: readonly string[],
  ) => ParsedCliCommand<ErnieUiControlCommand> | null;
  parseRequest: (value: JsonValue | undefined) => ErnieUiControlCommand | null;
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

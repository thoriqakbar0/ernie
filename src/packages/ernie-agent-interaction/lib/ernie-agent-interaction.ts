import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { type Static, Type } from 'typebox';

import {
  ernieUiSidebarMaximumWidth,
  ernieUiSidebarMinimumWidth,
  requestErnieUiControl,
  type ErnieUiControlCommand,
  type ErnieUiControlFailureCode,
} from '../../ernie-ui-control/index.js';
import { isJsonString } from '../../json-value/index.js';

/** Prime Agent extension flag that identifies the hosting Ernie process. */
export const ernieUiControlSocketFlagName = 'ernie-ui-control-socket';

const ernieUiInteractionParameters = Type.Union([
  Type.Object({ action: Type.Literal('focus') }, {
    additionalProperties: false,
  }),
  Type.Object(
    {
      action: Type.Literal('set_theme'),
      theme: Type.Union([Type.Literal('dark'), Type.Literal('light')]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      action: Type.Literal('set_sidebar_open'),
      open: Type.Boolean(),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      action: Type.Literal('set_sidebar_width'),
      width: Type.Integer({
        maximum: ernieUiSidebarMaximumWidth,
        minimum: ernieUiSidebarMinimumWidth,
      }),
    },
    { additionalProperties: false },
  ),
]);

/** One UI interaction that Prime Agent can request from its Ernie host. */
export type ErnieUiAgentInteraction = Static<
  typeof ernieUiInteractionParameters
>;

type ErnieUiAgentInteractionDetails = Readonly<{
  interaction: ErnieUiAgentInteraction;
}>;

class ErnieUiAgentInteractionError extends Error {
  readonly _tag = 'ErnieUiAgentInteractionError';

  constructor(
    readonly code: ErnieUiControlFailureCode,
    message: string,
  ) {
    super(message);
  }
}

function commandFromInteraction(
  interaction: ErnieUiAgentInteraction,
): ErnieUiControlCommand {
  switch (interaction.action) {
    case 'focus':
      return { type: 'focus' };
    case 'set_theme':
      return { theme: interaction.theme, type: 'set-theme' };
    case 'set_sidebar_open':
      return { open: interaction.open, type: 'set-sidebar-open' };
    case 'set_sidebar_width':
      return { type: 'set-sidebar-width', width: interaction.width };
  }
}

function unavailableSocketPath(): never {
  throw new ErnieUiAgentInteractionError(
    'app_unavailable',
    'Ernie UI interaction is unavailable in this host.',
  );
}

/** Create the model-facing tool that controls the hosting Ernie process. */
export function createErnieUiTool(
  resolveSocketPath: () => string | undefined,
) {
  return {
    description:
      "Interact with the Ernie app hosting this Prime Agent session. Focus its window, change its theme, or control its sidebar.",
    executionMode: 'sequential',
    label: 'Ernie UI',
    name: 'ernie_ui',
    parameters: ernieUiInteractionParameters,
    promptGuidelines: [
      "Use ernie_ui only when the user asks to change Ernie's window, theme, or sidebar.",
    ],
    async execute(
      _toolCallId: string,
      interaction: ErnieUiAgentInteraction,
      signal: AbortSignal | undefined,
    ): Promise<AgentToolResult<ErnieUiAgentInteractionDetails>> {
      const socketPath = resolveSocketPath()?.trim();
      if (socketPath === undefined || socketPath.length === 0) {
        unavailableSocketPath();
      }

      const result = await requestErnieUiControl(
        socketPath,
        commandFromInteraction(interaction),
        signal,
      );
      if (!result.ok) {
        throw new ErnieUiAgentInteractionError(
          result.error.code,
          result.error.message,
        );
      }
      return {
        content: [{ type: 'text', text: 'Ernie accepted the UI interaction.' }],
        details: { interaction },
      };
    },
  } satisfies ToolDefinition<
    typeof ernieUiInteractionParameters,
    ErnieUiAgentInteractionDetails
  >;
}

/** Install Ernie's model-facing UI interaction tool into Prime Agent. */
export default function installErnieAgentInteraction(
  primeAgent: ExtensionAPI,
): void {
  primeAgent.registerFlag(ernieUiControlSocketFlagName, {
    description: 'Path to the owner-only socket for the hosting Ernie process.',
    type: 'string',
  });
  primeAgent.registerTool(
    createErnieUiTool(() => {
      const value = primeAgent.getFlag(ernieUiControlSocketFlagName);
      return isJsonString(value) ? value : undefined;
    }),
  );
}

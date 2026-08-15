import type {
  AgentToolResult,
  ExtensionAPI,
  ToolDefinition,
} from 'prime-agent' with { 'resolution-mode': 'import' };
import { Type } from 'typebox';

const maximumSessionNameLength = 48;
const maximumSessionNameWords = 7;
const ellipsis = '…';

function sentenceCase(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]?.toLocaleUpperCase() ?? ''}${value.slice(1)}`;
}

/** Normalize one agent-proposed display name to Ernie's session-name limits. */
export function sessionNameFromAgentSuggestion(
  suggestion: string,
): string | null {
  const normalized = suggestion.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) return null;
  if (normalized.length <= maximumSessionNameLength) {
    return sentenceCase(normalized);
  }

  const availableLength = maximumSessionNameLength - ellipsis.length;
  const clipped = normalized.slice(0, availableLength).trimEnd();
  return sentenceCase(`${clipped}${ellipsis}`);
}

/** Derive a compact session name from the first non-empty user message. */
export function sessionNameFromFirstMessage(message: string): string | null {
  const normalized = message
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[?.!]+$/gu, '')
    .replace(/\s+(?:from|on a scale of)\s+\d+\s*(?:-|–|to)\s*\d+$/iu, '')
    .replace(/^(?:please\s+|can you\s+|could you\s+|would you\s+|help me\s+)/iu, '')
    .trim();
  if (normalized.length === 0) return null;

  const words = normalized.split(' ');
  const wordLimited =
    words.length > maximumSessionNameWords
      ? `${words.slice(0, maximumSessionNameWords).join(' ')}${ellipsis}`
      : normalized;
  if (wordLimited.length <= maximumSessionNameLength) {
    return sentenceCase(wordLimited);
  }

  const availableLength = maximumSessionNameLength - ellipsis.length;
  const clipped = wordLimited.slice(0, availableLength).trimEnd();
  return sentenceCase(`${clipped}${ellipsis}`);
}

const renameSessionParameters = Type.Object(
  {
    name: Type.String({
      description: 'A concise name that describes the current work.',
      maxLength: 160,
      minLength: 1,
      pattern: '\\S',
    }),
  },
  { additionalProperties: false },
);

type RenameSessionDetails =
  | Readonly<{ name: null; renamed: false }>
  | Readonly<{ name: string; renamed: true }>;

/** Normalize and persist one session name proposed by the current agent. */
export async function renameSessionFromAgentSuggestion(
  setSessionName: ExtensionAPI['setSessionName'],
  suggestion: string,
): Promise<AgentToolResult<RenameSessionDetails>> {
  const name = sessionNameFromAgentSuggestion(suggestion);
  if (name === null) {
    return {
      content: [
        {
          text: 'The session name must contain a visible character.',
          type: 'text',
        },
      ],
      details: { name: null, renamed: false },
    };
  }

  await setSessionName(name);
  return {
    content: [{ text: `Session renamed to "${name}".`, type: 'text' }],
    details: { name, renamed: true },
  };
}

/** Create the session-scoped tool that lets an agent rename itself. */
export function createRenameSessionTool(
  setSessionName: ExtensionAPI['setSessionName'],
) {
  return {
    description:
      'Rename the current Ernie session to a concise name that reflects the work.',
    executionMode: 'sequential',
    label: 'Rename session',
    name: 'rename_session',
    parameters: renameSessionParameters,
    promptGuidelines: [
      'After understanding the first user request, you must call rename_session before other work.',
      'When calling rename_session, provide a concise, specific work name.',
      'Call rename_session again when the work changes materially.',
    ],
    execute(_toolCallId, parameters) {
      return renameSessionFromAgentSuggestion(setSessionName, parameters.name);
    },
  } satisfies ToolDefinition<
    typeof renameSessionParameters,
    RenameSessionDetails
  >;
}

/** Install Ernie's session naming capabilities into Prime Agent. */
export default function installSessionNameExtension(
  primeAgent: ExtensionAPI,
): void {
  primeAgent.registerTool(
    createRenameSessionTool((name) => primeAgent.setSessionName(name)),
  );
  primeAgent.on('input', async (event) => {
    if (primeAgent.getSessionName() !== undefined) {
      return { action: 'continue' };
    }

    const name = sessionNameFromFirstMessage(event.text);
    if (name !== null) await primeAgent.setSessionName(name);
    return { action: 'continue' };
  });
}

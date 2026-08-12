import type { ExtensionAPI } from 'prime-agent' with {
  'resolution-mode': 'import',
};

const maximumSessionNameLength = 48;
const maximumSessionNameWords = 7;
const ellipsis = '…';

function sentenceCase(value: string): string {
  return value.length === 0
    ? value
    : `${value[0]?.toLocaleUpperCase() ?? ''}${value.slice(1)}`;
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

/** Install Ernie's first-message session naming hook into Prime Agent. */
export default function installFirstMessageSessionNameHook(
  primeAgent: ExtensionAPI,
): void {
  primeAgent.on('input', async (event) => {
    if (primeAgent.getSessionName() !== undefined) {
      return { action: 'continue' };
    }

    const name = sessionNameFromFirstMessage(event.text);
    if (name !== null) await primeAgent.setSessionName(name);
    return { action: 'continue' };
  });
}

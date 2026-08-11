import type { ExtensionAPI } from 'prime-agent' with {
  'resolution-mode': 'import',
};

const maximumSessionNameLength = 72;
const ellipsis = '…';

/** Derive a compact session name from the first non-empty user message. */
export function sessionNameFromFirstMessage(message: string): string | null {
  const normalized = message.replace(/\s+/gu, ' ').trim();
  if (normalized.length === 0) return null;
  if (normalized.length <= maximumSessionNameLength) return normalized;

  const availableLength = maximumSessionNameLength - ellipsis.length;
  const clipped = normalized.slice(0, availableLength).trimEnd();
  return `${clipped}${ellipsis}`;
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

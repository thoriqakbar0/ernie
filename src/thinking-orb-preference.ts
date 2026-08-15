import type { OrbState } from 'thinking-orbs';

const thinkingOrbStateStorageKey = 'ernie:thinking-orb-state:v1';

/** The thinking animations available for active Agents. */
export const thinkingOrbOptions = [
  { label: 'Working', value: 'working' },
  { label: 'Searching', value: 'searching' },
  { label: 'Solving', value: 'solving' },
  { label: 'Listening', value: 'listening' },
  { label: 'Connecting', value: 'connecting' },
  { label: 'Weaving', value: 'weaving' },
  { label: 'Composing', value: 'composing' },
  { label: 'Breathing', value: 'breathing' },
  { label: 'Shaping', value: 'shaping' },
] as const satisfies readonly Readonly<{
  label: string;
  value: OrbState;
}>[];

/** One supported thinking animation preference. */
export type ThinkingOrbState = (typeof thinkingOrbOptions)[number]['value'];

/** Parse one unknown preference into a supported thinking animation. */
export function parseThinkingOrbState(
  value: string | null,
): ThinkingOrbState | null {
  return (
    thinkingOrbOptions.find((option) => option.value === value)?.value ?? null
  );
}

/** Read the saved thinking animation, falling back to the working state. */
export function readInitialThinkingOrbState(): ThinkingOrbState {
  return (
    parseThinkingOrbState(
      window.localStorage.getItem(thinkingOrbStateStorageKey),
    ) ?? 'working'
  );
}

/** Save the thinking animation used for active Agents. */
export function storeThinkingOrbState(state: ThinkingOrbState): void {
  window.localStorage.setItem(thinkingOrbStateStorageKey, state);
}

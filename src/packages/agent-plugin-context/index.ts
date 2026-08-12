import type { PrimeAgentSessionView } from '../prime-agent-daemon/client.js';

/** Host-owned state available to plugins rendered inside the focused Agent. */
export interface AgentPluginViewContext {
  readonly onOpenSpawnedSession: (activeSessionId: string) => void;
  readonly sessionView: PrimeAgentSessionView;
}

/** Resolve the latest focused Agent state when a plugin view renders. */
export type AgentPluginViewContextProvider = () => AgentPluginViewContext;

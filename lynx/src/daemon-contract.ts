/** Operations that one Agent harness can expose through Ernie's host bridge. */
export type AgentHarnessCapability =
  | 'live-sessions'
  | 'saved-sessions'
  | 'models'
  | 'skills'
  | 'rlm-depth'
  | 'refinement'

/** Stable harness identity sent from the daemon host into ReactLynx. */
export type AgentHarnessDescriptor = Readonly<{
  capabilities: readonly AgentHarnessCapability[]
  id: string
  name: string
}>

/** Truthful lifecycle states for the daemon connection owned by the host. */
export type AgentDaemonConnectionState =
  | 'cold'
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'unavailable'
  | 'closed'

/** Expected daemon failure codes that can safely cross the Lynx boundary. */
export type AgentDaemonFailureCode =
  | 'invalid_request'
  | 'daemon_unavailable'
  | 'request_failed'
  | 'outcome_uncertain'
  | 'unsupported_operation'
  | 'protocol_error'

/** A safe expected failure returned by an Agent daemon operation. */
export type AgentDaemonFailure = Readonly<{
  code: AgentDaemonFailureCode
  message: string
}>

/** A serializable result returned across the future native-module boundary. */
export type AgentDaemonResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ error: AgentDaemonFailure; ok: false }>

/** Prime Agent capabilities ported from the source daemon worktree. */
export const primeAgentHarness = Object.freeze({
  capabilities: Object.freeze([
    'live-sessions',
    'saved-sessions',
    'models',
    'skills',
    'rlm-depth',
    'refinement',
  ] as const),
  id: 'prime-agent',
  name: 'Prime Agent',
}) satisfies AgentHarnessDescriptor

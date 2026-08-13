/** Live Prime Agent states accepted by the Lynx receiver boundary. */
export type AgentActivity =
  | 'working'
  | 'queued'
  | 'needs_input'
  | 'idle'
  | 'settled'

/** One active Prime Agent session received from the Node host. */
export type ActiveAgent = Readonly<{
  activeSessionId: string
  activity: AgentActivity
  cwd: string
  modifiedAt: string | null
  name: string
}>

/** One complete daemon roster update received by Lynx. */
export type DaemonRoster = Readonly<{
  activeAgents: readonly ActiveAgent[]
  connection: 'ready' | 'unavailable'
  currentCwd: string
  revision: number
}>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseActivity(value: unknown): AgentActivity | null {
  return value === 'working' ||
      value === 'queued' ||
      value === 'needs_input' ||
      value === 'idle' ||
      value === 'settled'
    ? value
    : null
}

function parseActiveAgent(value: unknown): ActiveAgent | null {
  if (!isRecord(value)) return null
  const activity = parseActivity(value.activity)
  if (
    typeof value.activeSessionId !== 'string' ||
    activity === null ||
    typeof value.cwd !== 'string' ||
    (value.modifiedAt !== null && typeof value.modifiedAt !== 'string') ||
    typeof value.name !== 'string'
  ) {
    return null
  }
  return {
    activeSessionId: value.activeSessionId,
    activity,
    cwd: value.cwd,
    modifiedAt: value.modifiedAt,
    name: value.name,
  }
}

/** Parse unknown host data before the Lynx application accepts it. */
export function parseDaemonRoster(value: unknown): DaemonRoster | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.activeAgents) ||
    (value.connection !== 'ready' && value.connection !== 'unavailable') ||
    typeof value.currentCwd !== 'string' ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0
  ) {
    return null
  }
  const activeAgents = value.activeAgents.map(parseActiveAgent)
  if (activeAgents.some(agent => agent === null)) return null
  return {
    activeAgents: activeAgents.flatMap(agent => agent === null ? [] : [agent]),
    connection: value.connection,
    currentCwd: value.currentCwd,
    revision: value.revision as number,
  }
}

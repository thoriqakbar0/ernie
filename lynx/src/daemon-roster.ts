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
  model: Readonly<{
    id: string
    key: string
    name: string
    provider: string
  }> | null
  modifiedAt: string | null
  name: string
  sessionJsonl: string | null
  sessionPath: string | null
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

function parseModel(value: unknown): ActiveAgent['model'] | undefined {
  if (value === null) return null
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.key !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.provider !== 'string'
  ) {
    return undefined
  }
  return {
    id: value.id,
    key: value.key,
    name: value.name,
    provider: value.provider,
  }
}

function parseActiveAgent(value: unknown): ActiveAgent | null {
  if (!isRecord(value)) return null
  const activity = parseActivity(value.activity)
  const model = parseModel(value.model)
  if (
    typeof value.activeSessionId !== 'string' ||
    activity === null ||
    typeof value.cwd !== 'string' ||
    model === undefined ||
    (value.modifiedAt !== null && typeof value.modifiedAt !== 'string') ||
    typeof value.name !== 'string' ||
    (value.sessionJsonl !== null && typeof value.sessionJsonl !== 'string') ||
    (value.sessionPath !== null && typeof value.sessionPath !== 'string')
  ) {
    return null
  }
  return {
    activeSessionId: value.activeSessionId,
    activity,
    cwd: value.cwd,
    model,
    modifiedAt: value.modifiedAt,
    name: value.name,
    sessionJsonl: value.sessionJsonl,
    sessionPath: value.sessionPath,
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

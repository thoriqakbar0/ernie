const bridgeBaseUrl = 'http://127.0.0.1:4319/v1'

/** Live Prime Agent states returned by Ernie's daemon bridge. */
export type AgentActivity =
  | 'working'
  | 'queued'
  | 'needs_input'
  | 'idle'
  | 'settled'

/** One live Prime Agent session parsed at the Lynx network boundary. */
export type AgentSession = Readonly<{
  activeSessionId: string
  activity: AgentActivity
  cwd: string
  modifiedAt: string | null
  name: string
}>

/** The live workspace returned by Ernie's daemon bridge. */
export type AgentWorkspace = Readonly<{
  currentCwd: string
  sessions: readonly AgentSession[]
}>

type DaemonFailure = Readonly<{
  code: string
  message: string
}>

/** A parsed success or expected daemon failure. */
export type DaemonResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ error: DaemonFailure; ok: false }>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFailure(value: unknown): DaemonFailure | null {
  if (!isRecord(value)) return null
  return typeof value.code === 'string' && typeof value.message === 'string'
    ? { code: value.code, message: value.message }
    : null
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

function parseSession(value: unknown): AgentSession | null {
  if (!isRecord(value)) return null
  const activity = parseActivity(value.activity)
  if (
    typeof value.activeSessionId !== 'string' ||
    activity === null ||
    typeof value.cwd !== 'string' ||
    typeof value.name !== 'string' ||
    (value.modifiedAt !== null && typeof value.modifiedAt !== 'string')
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

function parseWorkspace(value: unknown): AgentWorkspace | null {
  if (
    !isRecord(value) ||
    typeof value.currentCwd !== 'string' ||
    !Array.isArray(value.sessions)
  ) {
    return null
  }
  const sessions = value.sessions.map(parseSession)
  if (sessions.some(session => session === null)) return null
  return {
    currentCwd: value.currentCwd,
    sessions: sessions.flatMap(session => (session === null ? [] : [session])),
  }
}

function parseResult<Value>(
  value: unknown,
  parseValue: (candidate: unknown) => Value | null,
): DaemonResult<Value> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return {
      error: { code: 'protocol_error', message: 'The daemon bridge returned invalid data.' },
      ok: false,
    }
  }
  if (!value.ok) {
    const error = parseFailure(value.error)
    return {
      error: error ?? {
        code: 'protocol_error',
        message: 'The daemon bridge returned an invalid failure.',
      },
      ok: false,
    }
  }
  const parsed = parseValue(value.value)
  return parsed === null
    ? {
        error: { code: 'protocol_error', message: 'The daemon bridge returned invalid data.' },
        ok: false,
      }
    : { ok: true, value: parsed }
}

async function request(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${bridgeBaseUrl}${path}`, body === undefined
    ? undefined
    : {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
  if (!response.ok) throw new Error(`The daemon bridge returned HTTP ${response.status}.`)
  const value: unknown = await response.json()
  return value
}

/** Copy selected ReactLynx source context through the local macOS bridge. */
export async function copyAnnotationContext(
  context: string,
): Promise<DaemonResult<true>> {
  try {
    return parseResult(
      await request('/annotations/copy', { context }),
      value => isRecord(value) && value.copied === true ? true : null,
    )
  } catch {
    return {
      error: { code: 'daemon_unavailable', message: 'The local daemon bridge is unavailable.' },
      ok: false,
    }
  }
}

/** Load and parse the current live Prime Agent workspace. */
export async function loadAgentWorkspace(): Promise<DaemonResult<AgentWorkspace>> {
  try {
    return parseResult(await request('/workspace'), parseWorkspace)
  } catch {
    return {
      error: { code: 'daemon_unavailable', message: 'The local daemon bridge is unavailable.' },
      ok: false,
    }
  }
}

/** Create one live Prime Agent session in the selected workspace. */
export async function createAgentSession(
  cwd: string,
): Promise<DaemonResult<AgentSession>> {
  try {
    return parseResult(
      await request('/sessions', { cwd, rlmMaxDepth: 1 }),
      parseSession,
    )
  } catch {
    return {
      error: { code: 'daemon_unavailable', message: 'The local daemon bridge is unavailable.' },
      ok: false,
    }
  }
}

/** Submit one task to a live Prime Agent session. */
export async function submitAgentTask(
  activeSessionId: string,
  message: string,
): Promise<DaemonResult<true>> {
  try {
    return parseResult(
      await request('/tasks', { activeSessionId, message }),
      value => isRecord(value) && value.accepted === true ? true : null,
    )
  } catch {
    return {
      error: { code: 'daemon_unavailable', message: 'The local daemon bridge is unavailable.' },
      ok: false,
    }
  }
}

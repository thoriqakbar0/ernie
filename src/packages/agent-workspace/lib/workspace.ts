import type { PrimeAgentGitWorkspace } from '../../prime-agent-daemon/git-client';
import type {
  PrimeAgentConfiguration,
  PrimeAgentModel,
  PrimeAgentResult,
  PrimeAgentSavedSession,
  PrimeAgentSession,
  PrimeAgentSessionRename,
  PrimeAgentSessionView,
  PrimeAgentSkill,
  PrimeAgentTaskReceipt,
  PrimeAgentThinkingLevel,
  PrimeAgentWorkspace,
} from '../../prime-agent-daemon/client';
import type { PrimeAgentWorkspaceConnection } from '../../prime-agent-daemon/types';
import { sessionNameFromFirstMessage } from '../../session-name-hook';

/** One folder choice projected from an Agent workspace. */
export interface AgentWorkspaceFolder {
  readonly branchName: string | null;
  readonly label: string;
  readonly repositoryCwd: string;
  readonly value: string;
}

/** Result of creating an Agent and delivering its required first task. */
export type CreateAgentWithTaskResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/** One spawned Agent target selected from a parent conversation. */
export interface AgentWorkspaceSpawnedTarget {
  readonly activeSessionId: string;
  readonly name: string;
  readonly number: number;
}

/** The Agent identity currently connected to Ernie's shared composer. */
export type AgentWorkspaceSelectedIdentity =
  | Readonly<{ kind: 'prime'; name: string }>
  | Readonly<{ kind: 'spawned'; name: string; number: number }>;

/** Connection lifecycle exposed to Ernie's workspace adapter. */
export interface AgentWorkspaceConnectionController {
  readonly loadingWorkspace: boolean;
  readonly primeAgentConnection: PrimeAgentWorkspaceConnection;
  readonly status: string;
}

/** Repository and Agent selection exposed to Ernie's navigation adapter. */
export interface AgentWorkspaceNavigationController {
  readonly busy: boolean;
  readonly folders: readonly AgentWorkspaceFolder[];
  readonly loadingSavedSessions: boolean;
  readonly importingSessionPath: string | null;
  readonly renamingSession: boolean;
  readonly repoName: string;
  readonly selectedCwd: string | null;
  readonly selectedSessionId: string | null;
  readonly sessions: readonly PrimeAgentSession[];
  readonly savedSessions: readonly PrimeAgentSavedSession[];
  readonly changeFolder: (cwd: string | null) => void;
  readonly startAgentDraft: (cwd: string) => void;
  readonly loadSavedSessions: () => void;
  readonly importSession: (sessionPath: string) => void;
  readonly renameSession: (rename: PrimeAgentSessionRename) => void;
  readonly selectSession: (activeSessionId: string) => void;
  readonly chooseWorkspaceDirectory: () => void;
  readonly addWorkspaceDirectory: () => Promise<string | null>;
}

/** Focused conversation state exposed to Ernie's chat adapter. */
export interface AgentWorkspaceConversationController {
  readonly loadingEarlierHistory: boolean;
  readonly selectedAgentIdentity: AgentWorkspaceSelectedIdentity | null;
  readonly selectedSessionView: PrimeAgentSessionView | null;
  readonly loadEarlierSessionHistory: () => void;
  readonly openSpawnedSession: (target: AgentWorkspaceSpawnedTarget) => void;
}

/** Local Git state and commands exposed to Ernie's workspace adapter. */
export interface AgentWorkspaceGitController {
  readonly gitBranch: string | null;
  readonly gitBranchBusy: boolean;
  readonly gitBranches: readonly string[];
  readonly gitWorktreeError: string | null;
  readonly changeGitBranch: (name: string | null) => void;
  readonly deleteGitBranch: (
    name: string,
    repositoryCwd?: string,
    worktreeCwd?: string,
  ) => void;
  readonly initializeGitRepository: () => void;
  readonly createGitWorktree: (branchName: string) => void;
}

/** Agent creation and model controls exposed to Ernie's composer adapter. */
export interface AgentWorkspaceComposerController {
  readonly creatingAgent: boolean;
  readonly modelBusy: boolean;
  readonly models: readonly PrimeAgentModel[];
  readonly skills: readonly PrimeAgentSkill[];
  readonly rlmMaxDepth: number;
  readonly rlmMaxDepthBusy: boolean;
  readonly selectedModelKey: string | null;
  readonly selectedThinkingLevel: PrimeAgentThinkingLevel | null;
  readonly selectedSessionRlmMaxDepth: number | null;
  readonly selectedSessionRlmMaxDepthBusy: boolean;
  readonly thinkingLevelBusy: boolean;
  readonly thinkingLevels: readonly PrimeAgentThinkingLevel[];
  readonly createAgentWithTask: (
    cwd: string,
    message: string,
  ) => Promise<CreateAgentWithTaskResult>;
  readonly changeModel: (modelKey: string | null) => void;
  readonly changeThinkingLevel: (thinkingLevel: string | null) => void;
  readonly changeRlmMaxDepth: (maxDepth: string | null) => void;
  readonly changeSelectedSessionRlmMaxDepth: (
    maxDepth: string | null,
  ) => void;
}

/** Cohesive capabilities consumed by Ernie's visible workspace adapters. */
export interface AgentWorkspaceController {
  readonly composer: AgentWorkspaceComposerController;
  readonly connection: AgentWorkspaceConnectionController;
  readonly conversation: AgentWorkspaceConversationController;
  readonly git: AgentWorkspaceGitController;
  readonly navigation: AgentWorkspaceNavigationController;
}

/** Stable initial selection derived from a daemon workspace snapshot. */
export interface AgentWorkspaceInitialSelection {
  readonly cwd: string;
  readonly sessionId: string | null;
}

/** Inputs needed to project Agent model and effort controls. */
export interface AgentWorkspaceControlSource {
  readonly configuration: PrimeAgentConfiguration | null;
  readonly draftModelKey: string | null;
  readonly draftThinkingLevel: PrimeAgentThinkingLevel;
  readonly models: readonly PrimeAgentModel[];
  readonly selectedSessionId: string | null;
}

/** Model and effort controls projected for the selected Agent context. */
export interface AgentWorkspaceControls {
  readonly selectedModelKey: string | null;
  readonly selectedThinkingLevel: PrimeAgentThinkingLevel | null;
  readonly thinkingLevels: readonly PrimeAgentThinkingLevel[];
}

/** Adapter used by the Agent creation workflow. */
export interface AgentCreationPort {
  readonly createSession: (request: Readonly<{
    cwd: string;
    rlmMaxDepth: number;
  }>) => Promise<PrimeAgentResult<PrimeAgentSession>>;
  readonly setModel: (request: Readonly<{
    activeSessionId: string;
    modelId: string;
    provider: string;
  }>) => Promise<PrimeAgentResult<PrimeAgentConfiguration>>;
  readonly setThinkingLevel: (request: Readonly<{
    activeSessionId: string;
    thinkingLevel: PrimeAgentThinkingLevel;
  }>) => Promise<PrimeAgentResult<PrimeAgentConfiguration>>;
  readonly submitTask: (request: Readonly<{
    activeSessionId: string;
    message: string;
  }>) => Promise<PrimeAgentResult<PrimeAgentTaskReceipt>>;
}

/** One fully specified request for creating and configuring an Agent. */
export interface AgentCreationRequest {
  readonly cwd: string;
  readonly message: string;
  readonly model: PrimeAgentModel | null;
  readonly rlmMaxDepth: number;
  readonly thinkingLevel: PrimeAgentThinkingLevel | null;
}

/** Complete Agent creation result, including recoverable partial creation. */
export type AgentCreationOutcome =
  | Readonly<{
      configuration: PrimeAgentConfiguration | null;
      ok: true;
      session: PrimeAgentSession;
    }>
  | Readonly<{
      configuration: PrimeAgentConfiguration | null;
      message: string;
      ok: false;
      session: PrimeAgentSession | null;
      unexpected: false;
    }>
  | Readonly<{
      configuration: PrimeAgentConfiguration | null;
      error: AgentCreationTransportError;
      message: string;
      ok: false;
      session: PrimeAgentSession | null;
      unexpected: true;
    }>;

/** Unexpected transport failure retained with its original cause and stage. */
export class AgentCreationTransportError extends Error {
  readonly _tag = 'AgentCreationTransportError';

  constructor(
    readonly stage: 'create' | 'model' | 'thinking' | 'task',
    message: string,
    cause: unknown,
  ) {
    super(message, { cause });
    this.name = 'AgentCreationTransportError';
  }
}

/** Return the final path segment used for an Agent workspace label. */
export function agentWorkspaceName(cwd: string): string {
  const segments = cwd.split(/[\\/]/u).filter(Boolean);
  return segments.at(-1) ?? cwd;
}

/** Choose the initial workspace and first matching daemon Agent exactly once. */
export function selectInitialAgentWorkspace(
  workspace: PrimeAgentWorkspace,
): AgentWorkspaceInitialSelection {
  const cwd = workspace.sessions.some(
    (session) => session.cwd === workspace.currentCwd,
  )
    ? workspace.currentCwd
    : (workspace.sessions[0]?.cwd ?? workspace.currentCwd);
  const session = workspace.sessions.find((candidate) => candidate.cwd === cwd);
  return { cwd, sessionId: session?.activeSessionId ?? null };
}

/** Project repository-aware folder choices in first-seen path order. */
export function projectAgentWorkspaceFolders(
  workspacePaths: readonly string[],
  gitWorkspaces: ReadonlyMap<string, PrimeAgentGitWorkspace>,
): readonly AgentWorkspaceFolder[] {
  return workspacePaths.flatMap((cwd): readonly AgentWorkspaceFolder[] => {
    const identity = gitWorkspaces.get(cwd);
    if (identity === undefined) return [];
    const branchName = identity.cwd !== identity.repositoryCwd
      ? identity.branchName
      : null;
    return [{
      branchName,
      label: branchName ?? agentWorkspaceName(cwd),
      repositoryCwd: identity.repositoryCwd,
      value: cwd,
    }];
  });
}

/** Merge a newly connected Agent into the newest workspace snapshot. */
export function connectAgentWorkspaceSession(
  workspace: PrimeAgentWorkspace | null,
  session: PrimeAgentSession,
): PrimeAgentWorkspace {
  const daemonSession = workspace?.sessions.find(
    (candidate) => candidate.activeSessionId === session.activeSessionId,
  );
  const connectedSession = daemonSession === undefined
    ? session
    : {
        ...daemonSession,
        model: session.model ?? daemonSession.model,
      };
  return {
    currentCwd: workspace?.currentCwd ?? session.cwd,
    sessions: [
      connectedSession,
      ...(workspace?.sessions.filter(
        (candidate) => candidate.activeSessionId !== session.activeSessionId,
      ) ?? []),
    ],
  };
}

/** Project model and effort controls for a draft or selected Agent. */
export function projectAgentWorkspaceControls(
  source: AgentWorkspaceControlSource,
): AgentWorkspaceControls {
  const draftModel = source.models.find(
    (model) => model.key === source.draftModelKey,
  ) ?? null;
  const selectedModelKey = source.selectedSessionId === null
    ? draftModel?.key ?? null
    : source.models.find(
        (model) => model.key === source.configuration?.model.key,
      )?.key ?? null;
  const thinkingLevels = source.selectedSessionId === null
    ? (draftModel?.thinkingLevels ?? [])
    : (source.configuration?.availableThinkingLevels ?? []);
  const selectedThinkingLevel = source.selectedSessionId === null
    ? clampAgentThinkingLevel(source.draftThinkingLevel, thinkingLevels)
    : (source.configuration?.thinkingLevel ?? null);
  return { selectedModelKey, selectedThinkingLevel, thinkingLevels };
}

function clampAgentThinkingLevel(
  requested: PrimeAgentThinkingLevel,
  available: readonly PrimeAgentThinkingLevel[],
): PrimeAgentThinkingLevel | null {
  if (available.includes(requested)) return requested;
  const levels = [
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const satisfies readonly PrimeAgentThinkingLevel[];
  const requestedIndex = levels.indexOf(requested);
  for (let index = requestedIndex + 1; index < levels.length; index += 1) {
    const candidate = levels[index];
    if (candidate !== undefined && available.includes(candidate)) return candidate;
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = levels[index];
    if (candidate !== undefined && available.includes(candidate)) return candidate;
  }
  return null;
}

/** Run create, model, effort, and first-task steps with partial recovery. */
export async function createAgentWithTask(
  port: AgentCreationPort,
  request: AgentCreationRequest,
): Promise<AgentCreationOutcome> {
  let recoverableSession: PrimeAgentSession | null = null;
  let configuration: PrimeAgentConfiguration | null = null;
  let unexpectedMessage = 'Ernie could not create a new Agent.';
  let stage: AgentCreationTransportError['stage'] = 'create';

  try {
    const sessionResult = await port.createSession({
      cwd: request.cwd,
      rlmMaxDepth: request.rlmMaxDepth,
    });
    if (!sessionResult.ok) {
      return {
        configuration,
        message: sessionResult.error.message,
        ok: false,
        session: null,
        unexpected: false,
      };
    }

    let session = sessionResult.value;
    recoverableSession = session;
    if (request.model !== null) {
      stage = 'model';
      unexpectedMessage = 'Ernie created the Agent, but could not set its model.';
      const modelResult = await port.setModel({
        activeSessionId: session.activeSessionId,
        modelId: request.model.id,
        provider: request.model.provider,
      });
      if (!modelResult.ok) {
        return {
          configuration,
          message: modelResult.error.message,
          ok: false,
          session,
          unexpected: false,
        };
      }
      configuration = modelResult.value;
      session = { ...session, model: configuration.model };
      recoverableSession = session;
    }

    if (request.thinkingLevel !== null) {
      stage = 'thinking';
      unexpectedMessage =
        'Ernie created the Agent, but could not set its reasoning effort.';
      const thinkingResult = await port.setThinkingLevel({
        activeSessionId: session.activeSessionId,
        thinkingLevel: request.thinkingLevel,
      });
      if (!thinkingResult.ok) {
        return {
          configuration,
          message: thinkingResult.error.message,
          ok: false,
          session,
          unexpected: false,
        };
      }
      configuration = thinkingResult.value;
      session = { ...session, model: configuration.model };
      recoverableSession = session;
    }

    unexpectedMessage =
      'Ernie created the Agent, but could not send its first task.';
    stage = 'task';
    const taskResult = await port.submitTask({
      activeSessionId: session.activeSessionId,
      message: request.message,
    });
    return taskResult.ok
      ? {
          configuration,
          ok: true,
          session: {
            ...session,
            activity: 'queued',
            name: sessionNameFromFirstMessage(request.message) ?? session.name,
          },
        }
      : {
          configuration,
          message: taskResult.error.message,
          ok: false,
          session,
          unexpected: false,
        };
  } catch (cause: unknown) {
    if (
      cause instanceof Error &&
      (cause.name === 'AbortError' || cause.name === 'InterruptedException')
    ) {
      throw cause;
    }
    return {
      configuration,
      error: new AgentCreationTransportError(stage, unexpectedMessage, cause),
      message: unexpectedMessage,
      ok: false,
      session: recoverableSession,
      unexpected: true,
    };
  }
}

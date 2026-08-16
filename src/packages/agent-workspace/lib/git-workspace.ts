import type {
  PrimeAgentGitBranchSelection,
  PrimeAgentGitBranches,
  PrimeAgentGitWorkspace,
  PrimeAgentGitWorktree,
  PrimeAgentGitWorktreeCreation,
  PrimeAgentResult,
} from '../../prime-agent-daemon/types.js';

/** Local Git operations required by the Agent workspace module. */
export interface AgentGitWorkspacePort {
  readonly createWorktree: (
    creation: PrimeAgentGitWorktreeCreation,
  ) => Promise<PrimeAgentResult<PrimeAgentGitWorktree>>;
  readonly deleteBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly initializeGit: (
    cwd: string,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
  readonly readWorkspace: (
    cwd: string,
  ) => Promise<PrimeAgentResult<PrimeAgentGitWorkspace>>;
  readonly switchBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<PrimeAgentResult<PrimeAgentGitBranches>>;
}

/** Unexpected local Git transport failure with its original cause. */
export class AgentGitTransportError extends Error {
  readonly _tag = 'AgentGitTransportError';

  constructor(cause: unknown) {
    super('Ernie could not connect to local Git.', { cause });
    this.name = 'AgentGitTransportError';
  }
}

/** Typed result of one local Git workspace transition. */
export type AgentGitTransition<T> =
  | Readonly<{ ok: true; status: string; value: T }>
  | Readonly<{
      error: AgentGitTransportError | Readonly<{ message: string }>;
      ok: false;
    }>;

/** Cohesive local Git application service used by React's workspace adapter. */
export interface AgentGitWorkspaceService {
  readonly createWorktree: (
    creation: PrimeAgentGitWorktreeCreation,
  ) => Promise<AgentGitTransition<PrimeAgentGitWorktree>>;
  readonly deleteBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<AgentGitTransition<PrimeAgentGitBranches>>;
  readonly identifyWorkspaces: (
    cwds: readonly string[],
  ) => Promise<ReadonlyMap<string, PrimeAgentGitWorkspace>>;
  readonly initializeRepository: (
    cwd: string,
  ) => Promise<AgentGitTransition<PrimeAgentGitBranches>>;
  readonly switchBranch: (
    selection: PrimeAgentGitBranchSelection,
  ) => Promise<AgentGitTransition<PrimeAgentGitBranches>>;
}

function isCancellation(cause: unknown): boolean {
  return cause instanceof Error &&
    (cause.name === 'AbortError' || cause.name === 'InterruptedException');
}

async function runGitTransition<T>(
  operation: () => Promise<PrimeAgentResult<T>>,
  status: (value: T) => string,
): Promise<AgentGitTransition<T>> {
  try {
    const result = await operation();
    return result.ok
      ? { ok: true, status: status(result.value), value: result.value }
      : { error: result.error, ok: false };
  } catch (cause: unknown) {
    if (isCancellation(cause)) throw cause;
    return { error: new AgentGitTransportError(cause), ok: false };
  }
}

/** Create a local Git service with transition policy outside React. */
export function createAgentGitWorkspaceService(
  port: AgentGitWorkspacePort,
): AgentGitWorkspaceService {
  return {
    createWorktree: (creation) =>
      runGitTransition(
        () => port.createWorktree(creation),
        (worktree) => `Created worktree for ${worktree.branchName}.`,
      ),
    deleteBranch: (selection) =>
      runGitTransition(
        () => port.deleteBranch(selection),
        () => `Deleted local Git branch ${selection.name}.`,
      ),
    async identifyWorkspaces(cwds) {
      const identified = await Promise.all(
        cwds.map(async (cwd): Promise<readonly [string, PrimeAgentGitWorkspace] | null> => {
          try {
            const result = await port.readWorkspace(cwd);
            return result.ok ? [cwd, result.value] : null;
          } catch (cause: unknown) {
            if (isCancellation(cause)) throw cause;
            return null;
          }
        }),
      );
      return new Map(
        identified.filter(
          (entry): entry is readonly [string, PrimeAgentGitWorkspace] =>
            entry !== null,
        ),
      );
    },
    initializeRepository: (cwd) =>
      runGitTransition(
        () => port.initializeGit(cwd),
        () => 'Initialized local Git repository with main.',
      ),
    switchBranch: (selection) =>
      runGitTransition(
        () => port.switchBranch(selection),
        () => `Git branch changed to ${selection.name}.`,
      ),
  };
}

import { Effect, Fiber } from 'effect';
import { useEffect, useMemo, useState } from 'react';

import {
  parsePrimeAgentGitBranchesResult,
} from '@/packages/prime-agent-daemon/git-client';
import {
  parsePrimeAgentModelResult,
  parsePrimeAgentModelsResult,
  parsePrimeAgentRlmDepthResult,
  parsePrimeAgentWorkspaceResult,
  type PrimeAgentModel,
  type PrimeAgentSession,
  type PrimeAgentWorkspace,
} from '@/packages/prime-agent-daemon/client';

/** One folder choice derived from live Prime Agent sessions. */
export interface PrimeAgentFolderChoice {
  readonly label: string;
  readonly value: string;
}

/** Live state and actions used by Ernie's task and environment controls. */
export interface PrimeAgentWorkspaceController {
  readonly busy: boolean;
  readonly folders: readonly PrimeAgentFolderChoice[];
  readonly gitBranch: string | null;
  readonly gitBranchBusy: boolean;
  readonly gitBranches: readonly string[];
  readonly loadingWorkspace: boolean;
  readonly models: readonly PrimeAgentModel[];
  readonly repoName: string;
  readonly rlmDepth: number | null;
  readonly selectedCwd: string | null;
  readonly selectedModelKey: string | null;
  readonly status: string;
  readonly changeFolder: (cwd: string | null) => void;
  readonly chooseWorkspaceDirectory: () => void;
  readonly changeGitBranch: (name: string | null) => void;
  readonly deleteGitBranch: (name: string) => void;
  readonly renameGitBranch: (currentName: string, newName: string) => void;
  readonly initializeGitRepository: () => void;
  readonly changeModel: (modelKey: string | null) => void;
  readonly changeRlmDepth: (maxDepth: string | null) => void;
}

type WorkspaceDirectorySelection =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false };

function parseWorkspaceDirectorySelection(
  value: unknown,
): WorkspaceDirectorySelection {
  if (value === null) return { ok: true, value: null };
  if (typeof value === 'string' && value.trim().length > 0) {
    return { ok: true, value };
  }
  return { ok: false };
}

function folderName(cwd: string): string {
  const parts = cwd.split(/[\\/]/u).filter((part) => part.length > 0);
  return parts.at(-1) ?? cwd;
}

function newestSession(
  sessions: readonly PrimeAgentSession[],
  cwd: string,
): PrimeAgentSession | null {
  return sessions.find((session) => session.cwd === cwd) ?? null;
}

/** Connect Ernie's task controls to the local Prime Agent daemon. */
export function usePrimeAgentWorkspace(): PrimeAgentWorkspaceController {
  const [workspace, setWorkspace] = useState<PrimeAgentWorkspace | null>(null);
  const [addedCwds, setAddedCwds] = useState<readonly string[]>([]);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [models, setModels] = useState<readonly PrimeAgentModel[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitBranches, setGitBranches] = useState<readonly string[]>([]);
  const [rlmDepth, setRlmDepth] = useState<number | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingSession, setLoadingSession] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [gitBranchBusy, setGitBranchBusy] = useState(false);
  const [savingRlmDepth, setSavingRlmDepth] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    const loadWorkspace = Effect.fn('Workspace.load')(function* () {
      yield* Effect.sync(() => setStatus('Connecting to Prime Agent…'));
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.listPrimeAgentWorkspace(),
      );
      if (!active) return;

      const result = parsePrimeAgentWorkspaceResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      const initialCwd = result.value.sessions.some(
        (session) => session.cwd === result.value.currentCwd,
      )
        ? result.value.currentCwd
        : (result.value.sessions[0]?.cwd ?? result.value.currentCwd);
      const initialSession = newestSession(result.value.sessions, initialCwd);
      yield* Effect.sync(() => {
        setWorkspace(result.value);
        setSelectedCwd(initialCwd);
        setSelectedSessionId(initialSession?.activeSessionId ?? null);
        setStatus(
          initialSession === null
            ? 'No connected agent in this workspace.'
            : 'Connected to Prime Agent.',
        );
      });
    });
    const fiber = Effect.runFork(
      loadWorkspace().pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            if (active) setStatus('The Prime Agent daemon is not available.');
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setLoadingWorkspace(false);
          }),
        ),
      ),
    );

    return () => {
      active = false;
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  useEffect(() => {
    if (selectedCwd === null) {
      setGitBranch(null);
      setGitBranches([]);
      setGitBranchBusy(false);
      return;
    }

    const cwd = selectedCwd;
    let active = true;
    const loadGitBranches = Effect.fn('Workspace.loadGitBranches')(
      function* () {
        yield* Effect.sync(() => {
          setGitBranchBusy(true);
          setStatus('Loading local Git branches…');
        });
        const rawResult = yield* Effect.tryPromise(() =>
          window.ernie.listPrimeAgentGitBranches(cwd),
        );
        if (!active) return;

        const result = parsePrimeAgentGitBranchesResult(rawResult);
        if (!result.ok) {
          yield* Effect.sync(() => {
            setGitBranch(null);
            setGitBranches([]);
            setStatus(result.error.message);
          });
          return;
        }

        yield* Effect.sync(() => {
          setGitBranch(result.value.current);
          setGitBranches(result.value.names);
          if (result.value.names.length === 0) {
            setStatus('No local Git repository found.');
          } else if (result.value.current === null) {
            setStatus(
              `Loaded ${result.value.names.length} local Git branches. No branch is active.`,
            );
          } else {
            setStatus(
              `Loaded ${result.value.names.length} local Git branches. Current branch is ${result.value.current}.`,
            );
          }
        });
      },
    );
    const fiber = Effect.runFork(
      loadGitBranches().pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            if (!active) return;
            setGitBranch(null);
            setGitBranches([]);
            setStatus('Ernie could not load local Git branches.');
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setGitBranchBusy(false);
          }),
        ),
      ),
    );

    return () => {
      active = false;
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [selectedCwd]);

  useEffect(() => {
    if (selectedSessionId === null) {
      setModels([]);
      setRlmDepth(null);
      return;
    }

    const activeSessionId = selectedSessionId;
    let active = true;
    const loadSessionControls = Effect.fn('Workspace.loadSessionControls')(
      function* () {
        yield* Effect.sync(() => setLoadingSession(true));
        const [rawModels, rawRlmDepth] = yield* Effect.all(
          [
            Effect.tryPromise(() =>
              window.ernie.listPrimeAgentModels(activeSessionId),
            ),
            Effect.tryPromise(() =>
              window.ernie.getPrimeAgentRlmDepth(activeSessionId),
            ),
          ],
          { concurrency: 'unbounded' },
        );
        if (!active) return;

        const modelResult = parsePrimeAgentModelsResult(rawModels);
        const rlmDepthResult = parsePrimeAgentRlmDepthResult(rawRlmDepth);
        yield* Effect.sync(() => {
          setModels(modelResult.ok ? modelResult.value : []);
          setRlmDepth(rlmDepthResult.ok ? rlmDepthResult.value.maxDepth : null);
          if (!modelResult.ok) setStatus(modelResult.error.message);
          else if (!rlmDepthResult.ok) setStatus(rlmDepthResult.error.message);
          else setStatus('Connected to Prime Agent.');
        });
      },
    );
    const fiber = Effect.runFork(
      loadSessionControls().pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            if (!active) return;
            setModels([]);
            setRlmDepth(null);
            setStatus('The Prime Agent daemon is not available.');
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setLoadingSession(false);
          }),
        ),
      ),
    );

    return () => {
      active = false;
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [selectedSessionId]);

  const folders = useMemo(() => {
    const paths = new Set([
      ...(workspace === null
        ? []
        : [
            workspace.currentCwd,
            ...workspace.sessions.map((session) => session.cwd),
          ]),
      ...addedCwds,
    ]);
    return [...paths].map((cwd) => ({ label: folderName(cwd), value: cwd }));
  }, [addedCwds, workspace]);

  const agents = useMemo(
    () =>
      workspace?.sessions.filter((session) => session.cwd === selectedCwd) ??
      [],
    [selectedCwd, workspace],
  );
  const selectedSession =
    agents.find((session) => session.activeSessionId === selectedSessionId) ??
    null;
  const selectedModelKey =
    models.find((model) => model.key === selectedSession?.model?.key)?.key ??
    null;

  function changeFolder(cwd: string | null): void {
    if (cwd === null) return;
    const session =
      workspace === null ? null : newestSession(workspace.sessions, cwd);
    setSelectedCwd(cwd);
    setSelectedSessionId(session?.activeSessionId ?? null);
    setStatus(
      session === null
        ? 'No connected agent in this workspace.'
        : 'Connected to Prime Agent.',
    );
  }

  function chooseWorkspaceDirectory(): void {
    const chooseDirectory = Effect.fn('Workspace.chooseDirectory')(function* () {
      yield* Effect.sync(() => {
        setChoosingDirectory(true);
        setStatus('Choosing a workspace directory…');
      });
      const rawSelection = yield* Effect.tryPromise(() =>
        window.ernie.chooseWorkspaceDirectory(),
      );
      const selection = parseWorkspaceDirectorySelection(rawSelection);
      if (!selection.ok) {
        yield* Effect.sync(() =>
          setStatus('Ernie received an invalid directory selection.'),
        );
        return;
      }
      if (selection.value === null) {
        yield* Effect.sync(() => setStatus('Directory selection canceled.'));
        return;
      }

      const cwd = selection.value;
      const session =
        workspace === null ? null : newestSession(workspace.sessions, cwd);
      yield* Effect.sync(() => {
        setAddedCwds((current) =>
          current.includes(cwd) ? current : [...current, cwd],
        );
        setSelectedCwd(cwd);
        setSelectedSessionId(session?.activeSessionId ?? null);
        setStatus(
          session === null
            ? 'Workspace selected. No connected agent in this directory.'
            : 'Connected to Prime Agent.',
        );
      });
    });

    Effect.runFork(
      chooseDirectory().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not open the directory picker.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setChoosingDirectory(false))),
      ),
    );
  }

  function changeModel(modelKey: string | null): void {
    if (modelKey === null || selectedSession === null) return;
    const model = models.find((candidate) => candidate.key === modelKey);
    if (model === undefined) return;

    const activeSessionId = selectedSession.activeSessionId;
    const provider = model.provider;
    const modelId = model.id;

    const updateModel = Effect.fn('Workspace.updateModel')(function* () {
      yield* Effect.sync(() => setSavingModel(true));
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.setPrimeAgentModel({
          activeSessionId,
          provider,
          modelId,
        }),
      );
      const result = parsePrimeAgentModelResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setWorkspace((current) =>
          current === null
            ? null
            : {
                ...current,
                sessions: current.sessions.map((session) =>
                  session.activeSessionId === activeSessionId
                    ? { ...session, model: result.value }
                    : session,
                ),
              },
        );
        setStatus(`Model changed to ${result.value.name}.`);
      });
    });

    Effect.runFork(
      updateModel().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('The Prime Agent daemon is not available.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setSavingModel(false))),
      ),
    );
  }

  function changeGitBranch(name: string | null): void {
    if (name === null || selectedCwd === null || name === gitBranch) return;
    const cwd = selectedCwd;
    const branchName = name;

    const switchGitBranch = Effect.fn('Workspace.switchGitBranch')(
      function* () {
        yield* Effect.sync(() => {
          setGitBranchBusy(true);
          setStatus(`Switching to local Git branch ${branchName}…`);
        });
        const rawResult = yield* Effect.tryPromise(() =>
          window.ernie.switchPrimeAgentGitBranch({
            cwd,
            name: branchName,
          }),
        );
        const result = parsePrimeAgentGitBranchesResult(rawResult);
        if (!result.ok) {
          yield* Effect.sync(() => setStatus(result.error.message));
          return;
        }

        yield* Effect.sync(() => {
          setGitBranch(result.value.current);
          setGitBranches(result.value.names);
          setStatus(`Git branch changed to ${branchName}.`);
        });
      },
    );

    Effect.runFork(
      switchGitBranch().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not connect to local Git.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setGitBranchBusy(false))),
      ),
    );
  }

  function deleteGitBranch(name: string): void {
    if (selectedCwd === null || name === gitBranch) return;
    const cwd = selectedCwd;

    const deleteBranch = Effect.fn('Workspace.deleteGitBranch')(function* () {
      yield* Effect.sync(() => {
        setGitBranchBusy(true);
        setStatus(`Deleting local Git branch ${name}…`);
      });
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.deletePrimeAgentGitBranch({
          cwd,
          name,
        }),
      );
      const result = parsePrimeAgentGitBranchesResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setGitBranch(result.value.current);
        setGitBranches(result.value.names);
        setStatus(`Deleted local Git branch ${name}.`);
      });
    });

    Effect.runFork(
      deleteBranch().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not connect to local Git.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setGitBranchBusy(false))),
      ),
    );
  }

  function renameGitBranch(currentName: string, newName: string): void {
    if (selectedCwd === null || currentName === newName) return;
    const cwd = selectedCwd;

    const renameBranch = Effect.fn('Workspace.renameGitBranch')(function* () {
      yield* Effect.sync(() => {
        setGitBranchBusy(true);
        setStatus(`Renaming local Git branch ${currentName}…`);
      });
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.renamePrimeAgentGitBranch({
          cwd,
          currentName,
          newName,
        }),
      );
      const result = parsePrimeAgentGitBranchesResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setGitBranch(result.value.current);
        setGitBranches(result.value.names);
        setStatus(`Renamed local Git branch to ${newName}.`);
      });
    });

    Effect.runFork(
      renameBranch().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not connect to local Git.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setGitBranchBusy(false))),
      ),
    );
  }

  function initializeGitRepository(): void {
    if (selectedCwd === null || gitBranches.length > 0) return;
    const cwd = selectedCwd;

    const initializeGit = Effect.fn('Workspace.initializeGit')(function* () {
      yield* Effect.sync(() => {
        setGitBranchBusy(true);
        setStatus('Initializing local Git repository with main…');
      });
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.initializePrimeAgentGit(cwd),
      );
      const result = parsePrimeAgentGitBranchesResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setGitBranch(result.value.current);
        setGitBranches(result.value.names);
        setStatus('Initialized local Git repository with main.');
      });
    });

    Effect.runFork(
      initializeGit().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not connect to local Git.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setGitBranchBusy(false))),
      ),
    );
  }

  function changeRlmDepth(value: string | null): void {
    if (value === null || selectedSession === null) return;
    const maxDepth = Number(value);
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) return;
    const activeSessionId = selectedSession.activeSessionId;

    const updateRlmDepth = Effect.fn('Workspace.updateRlmDepth')(function* () {
      yield* Effect.sync(() => {
        setSavingRlmDepth(true);
        setStatus(`Changing RLM depth to ${maxDepth}…`);
      });
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.setPrimeAgentRlmDepth({
          activeSessionId,
          maxDepth,
        }),
      );
      const result = parsePrimeAgentRlmDepthResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setRlmDepth(result.value.maxDepth);
        setStatus(`RLM depth changed to ${result.value.maxDepth}.`);
      });
    });

    Effect.runFork(
      updateRlmDepth().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('The Prime Agent daemon is not available.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setSavingRlmDepth(false))),
      ),
    );
  }

  return {
    busy:
      loadingWorkspace ||
      loadingSession ||
      choosingDirectory ||
      savingModel ||
      savingRlmDepth ||
      gitBranchBusy,
    folders,
    gitBranch,
    gitBranchBusy,
    gitBranches,
    loadingWorkspace,
    models,
    repoName: selectedCwd === null ? 'work' : folderName(selectedCwd),
    rlmDepth,
    selectedCwd,
    selectedModelKey,
    status,
    changeFolder,
    chooseWorkspaceDirectory,
    changeGitBranch,
    deleteGitBranch,
    renameGitBranch,
    initializeGitRepository,
    changeModel,
    changeRlmDepth,
  };
}

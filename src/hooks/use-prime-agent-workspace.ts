import { Effect, Fiber } from 'effect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  parsePrimeAgentGitBranchesResult,
  parsePrimeAgentGitWorkspaceResult,
  parsePrimeAgentGitWorktreeResult,
  type PrimeAgentGitWorkspace,
} from '@/packages/prime-agent-daemon/git-client';
import {
  parsePrimeAgentModelResult,
  parsePrimeAgentModelsResult,
  parsePrimeAgentSavedSessionsResult,
  parsePrimeAgentSessionRenameResult,
  parsePrimeAgentSessionResult,
  parsePrimeAgentSkillsResult,
  parsePrimeAgentTaskReceiptResult,
  parsePrimeAgentWorkspaceResult,
  type PrimeAgentModel,
  type PrimeAgentSavedSession,
  type PrimeAgentSession,
  type PrimeAgentSessionRename,
  type PrimeAgentSkill,
  type PrimeAgentWorkspace,
} from '@/packages/prime-agent-daemon/client';

/** One folder choice derived from live Prime Agent sessions. */
export interface PrimeAgentFolderChoice {
  readonly branchName: string | null;
  readonly label: string;
  readonly repositoryCwd: string;
  readonly value: string;
}

/** Result of creating an Agent and delivering its required first task. */
export type CreateAgentWithTaskResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

/** Live state and actions used by Ernie's task and environment controls. */
export interface PrimeAgentWorkspaceController {
  readonly busy: boolean;
  readonly folders: readonly PrimeAgentFolderChoice[];
  readonly gitBranch: string | null;
  readonly gitBranchBusy: boolean;
  readonly gitBranches: readonly string[];
  readonly gitWorktreeError: string | null;
  readonly creatingAgent: boolean;
  readonly loadingWorkspace: boolean;
  readonly loadingSavedSessions: boolean;
  readonly importingSessionPath: string | null;
  readonly renamingSession: boolean;
  readonly modelBusy: boolean;
  readonly models: readonly PrimeAgentModel[];
  readonly primeAgentConnection: 'connecting' | 'ready' | 'unavailable';
  readonly skills: readonly PrimeAgentSkill[];
  readonly repoName: string;
  readonly rlmMaxDepth: number;
  readonly rlmMaxDepthBusy: boolean;
  readonly selectedCwd: string | null;
  readonly selectedModelKey: string | null;
  readonly selectedSessionId: string | null;
  readonly sessions: readonly PrimeAgentSession[];
  readonly savedSessions: readonly PrimeAgentSavedSession[];
  readonly status: string;
  readonly changeFolder: (cwd: string | null) => void;
  readonly startAgentDraft: (cwd: string) => void;
  readonly createAgentWithTask: (
    cwd: string,
    message: string,
  ) => Promise<CreateAgentWithTaskResult>;
  readonly loadSavedSessions: () => void;
  readonly importSession: (sessionPath: string) => void;
  readonly renameSession: (rename: PrimeAgentSessionRename) => void;
  readonly selectSession: (activeSessionId: string) => void;
  readonly chooseWorkspaceDirectory: () => void;
  readonly changeGitBranch: (name: string | null) => void;
  readonly deleteGitBranch: (name: string) => void;
  readonly initializeGitRepository: () => void;
  readonly createGitWorktree: (branchName: string) => void;
  readonly changeModel: (modelKey: string | null) => void;
  readonly changeRlmMaxDepth: (maxDepth: string | null) => void;
}

const defaultRlmMaxDepth = 1;
const maximumRlmMaxDepth = 20;
const rlmMaxDepthStorageKey = 'ernie:rlm-max-depth:v1';

function parseStoredRlmMaxDepth(value: string | null): number {
  if (value === null || value.trim().length === 0) return defaultRlmMaxDepth;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= maximumRlmMaxDepth
    ? parsed
    : defaultRlmMaxDepth;
}

function loadStoredRlmMaxDepth(): number {
  try {
    return parseStoredRlmMaxDepth(
      window.localStorage.getItem(rlmMaxDepthStorageKey),
    );
  } catch {
    return defaultRlmMaxDepth;
  }
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
  const [skills, setSkills] = useState<readonly PrimeAgentSkill[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitBranches, setGitBranches] = useState<readonly string[]>([]);
  const [rlmMaxDepth, setRlmMaxDepth] = useState(loadStoredRlmMaxDepth);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [loadingSavedSessions, setLoadingSavedSessions] = useState(false);
  const [importingSessionPath, setImportingSessionPath] = useState<
    string | null
  >(null);
  const [renamingSession, setRenamingSession] = useState(false);
  const [savedSessions, setSavedSessions] = useState<
    readonly PrimeAgentSavedSession[]
  >([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [gitBranchBusy, setGitBranchBusy] = useState(false);
  const [gitWorktreeError, setGitWorktreeError] = useState<string | null>(null);
  const [gitWorkspaces, setGitWorkspaces] = useState<
    ReadonlyMap<string, PrimeAgentGitWorkspace>
  >(new Map());
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [status, setStatus] = useState('');
  const skipGitBranchLoadForCwd = useRef<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        rlmMaxDepthStorageKey,
        String(rlmMaxDepth),
      );
    } catch {
      // The in-memory preference remains usable when storage is unavailable.
    }
  }, [rlmMaxDepth]);

  useEffect(() => {
    let active = true;
    const loadWorkspace = Effect.fn('Workspace.load')(function* () {
      yield* Effect.sync(() => setStatus('Connecting to Prime Agent…'));
      const [rawWorkspace, rawSavedSessions] = yield* Effect.all(
        [
          Effect.tryPromise(() => window.ernie.listPrimeAgentWorkspace()),
          Effect.tryPromise(() =>
            window.ernie.listPrimeAgentSavedSessions(),
          ).pipe(Effect.catchAll(() => Effect.succeed(null))),
        ],
        { concurrency: 'unbounded' },
      );
      if (!active) return;

      const result = parsePrimeAgentWorkspaceResult(rawWorkspace);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }
      const savedSessionsResult = parsePrimeAgentSavedSessionsResult(
        rawSavedSessions,
      );

      const initialCwd = result.value.sessions.some(
        (session) => session.cwd === result.value.currentCwd,
      )
        ? result.value.currentCwd
        : (result.value.sessions[0]?.cwd ?? result.value.currentCwd);
      const initialSession = newestSession(result.value.sessions, initialCwd);
      yield* Effect.sync(() => {
        setWorkspace(result.value);
        if (savedSessionsResult.ok) {
          setSavedSessions(savedSessionsResult.value);
        }
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
    if (skipGitBranchLoadForCwd.current === selectedCwd) {
      skipGitBranchLoadForCwd.current = null;
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
      setSkills([]);
      return;
    }

    const activeSessionId = selectedSessionId;
    let active = true;
    const loadSessionControls = Effect.fn('Workspace.loadSessionControls')(
      function* () {
        yield* Effect.sync(() => setLoadingSession(true));
        const [rawModels, rawSkills] = yield* Effect.all(
          [
            Effect.tryPromise(() =>
              window.ernie.listPrimeAgentModels(activeSessionId),
            ),
            Effect.tryPromise(() =>
              window.ernie.listPrimeAgentSkills(activeSessionId),
            ),
          ],
          { concurrency: 'unbounded' },
        );
        if (!active) return;

        const modelResult = parsePrimeAgentModelsResult(rawModels);
        const skillsResult = parsePrimeAgentSkillsResult(rawSkills);
        yield* Effect.sync(() => {
          setModels(modelResult.ok ? modelResult.value : []);
          setSkills(skillsResult.ok ? skillsResult.value : []);
          if (!modelResult.ok) setStatus(modelResult.error.message);
          else if (!skillsResult.ok) setStatus(skillsResult.error.message);
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
            setSkills([]);
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

  const workspacePaths = useMemo(() => {
    const paths = new Set([
      ...(workspace === null
        ? []
        : [
            workspace.currentCwd,
            ...workspace.sessions.map((session) => session.cwd),
          ]),
      ...savedSessions.map((session) => session.cwd),
      ...addedCwds,
    ]);
    return [...paths];
  }, [addedCwds, savedSessions, workspace]);

  useEffect(() => {
    let active = true;
    const identifyWorkspaces = Effect.fn('Workspace.identifyGitWorkspaces')(
      function* () {
        const identified = yield* Effect.all(
          workspacePaths.map((cwd) =>
            Effect.tryPromise(() =>
              window.ernie.readPrimeAgentGitWorkspace(cwd),
            ).pipe(
              Effect.map(parsePrimeAgentGitWorkspaceResult),
              Effect.map((result) =>
                result.ok ? ([cwd, result.value] as const) : null,
              ),
              Effect.catchAll(() => Effect.succeed(null)),
            ),
          ),
          { concurrency: 'unbounded' },
        );
        if (!active) return;
        yield* Effect.sync(() => {
          setGitWorkspaces(
            new Map(
              identified.filter(
                (
                  entry,
                ): entry is readonly [string, PrimeAgentGitWorkspace] =>
                  entry !== null,
              ),
            ),
          );
        });
      },
    );
    const fiber = Effect.runFork(identifyWorkspaces());
    return () => {
      active = false;
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [workspacePaths]);

  const folders = useMemo(
    () =>
      workspacePaths.map((cwd) => {
        const identity = gitWorkspaces.get(cwd);
        const repositoryCwd = identity?.repositoryCwd ?? cwd;
        const branchName =
          identity !== undefined && identity.cwd !== identity.repositoryCwd
            ? identity.branchName
            : null;
        return {
          branchName,
          label: branchName ?? folderName(cwd),
          repositoryCwd,
          value: cwd,
        };
      }),
    [gitWorkspaces, workspacePaths],
  );

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

  function requestAgentSession(cwd: string) {
    return Effect.tryPromise(() =>
      window.ernie.createPrimeAgentSession({ cwd, rlmMaxDepth }),
    ).pipe(Effect.map(parsePrimeAgentSessionResult));
  }

  function connectAgentSession(session: PrimeAgentSession): void {
    setWorkspace((current) => ({
      currentCwd: current?.currentCwd ?? session.cwd,
      sessions: [
        session,
        ...(current?.sessions.filter(
          (candidate) =>
            candidate.activeSessionId !== session.activeSessionId,
        ) ?? []),
      ],
    }));
    setSelectedCwd(session.cwd);
    setSelectedSessionId(session.activeSessionId);
  }

  function changeFolder(cwd: string | null): void {
    if (cwd === null) return;
    setSelectedCwd(cwd);
    setSelectedSessionId(null);
    setGitWorktreeError(null);
    setStatus('New Agent workspace selected.');
  }

  function startAgentDraft(cwd: string): void {
    setSelectedCwd(cwd);
    setSelectedSessionId(null);
    setGitWorktreeError(null);
    setStatus('New Agent draft ready. Send its first task to start it.');
  }

  function createAgentWithTask(
    cwd: string,
    firstMessage: string,
  ): Promise<CreateAgentWithTaskResult> {
    const message = firstMessage.trim();
    if (message.length === 0) {
      return Promise.resolve({ ok: false, message: 'Enter a task first.' });
    }
    if (creatingAgent) {
      return Promise.resolve({
        ok: false,
        message: 'A new Agent is already starting.',
      });
    }

    const create = Effect.fn('Workspace.createAgentWithTask')(function* () {
      yield* Effect.sync(() => {
        setCreatingAgent(true);
        setStatus('Creating a new Agent…');
      });
      const result = yield* requestAgentSession(cwd);
      if (!result.ok) {
        return yield* Effect.sync(() => {
          setStatus(result.error.message);
          return { ok: false as const, message: result.error.message };
        });
      }

      const rawTaskResult = yield* Effect.tryPromise(() =>
        window.ernie.submitPrimeAgentTask({
          activeSessionId: result.value.activeSessionId,
          message,
        }),
      );
      const taskResult = parsePrimeAgentTaskReceiptResult(rawTaskResult);

      return yield* Effect.sync(() => {
        connectAgentSession(result.value);
        setStatus(
          taskResult.ok ? 'Task sent to Prime Agent.' : taskResult.error.message,
        );
        return taskResult.ok
          ? { ok: true as const }
          : { ok: false as const, message: taskResult.error.message };
      });
    });

    return Effect.runPromise(
      create().pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            const message = 'Ernie could not create a new Agent.';
            setStatus(message);
            return { ok: false as const, message };
          }),
        ),
        Effect.ensuring(Effect.sync(() => setCreatingAgent(false))),
      ),
    );
  }

  function loadSavedSessions(): void {
    if (loadingSavedSessions) return;

    const load = Effect.fn('Workspace.loadSavedSessions')(function* () {
      yield* Effect.sync(() => {
        setLoadingSavedSessions(true);
        setStatus('Loading saved Prime Agent sessions…');
      });
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.listPrimeAgentSavedSessions(),
      );
      const result = parsePrimeAgentSavedSessionsResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setSavedSessions(result.value);
        setStatus(
          result.value.length === 0
            ? 'No saved Prime Agent sessions found.'
            : `Found ${result.value.length} saved Prime Agent sessions.`,
        );
      });
    });

    Effect.runFork(
      load().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not load saved Prime Agent sessions.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setLoadingSavedSessions(false))),
      ),
    );
  }

  function importSession(sessionPath: string): void {
    if (importingSessionPath !== null) return;

    const importSavedSession = Effect.fn('Workspace.importSession')(
      function* () {
        yield* Effect.sync(() => {
          setImportingSessionPath(sessionPath);
          setStatus('Importing saved Prime Agent session…');
        });
        const rawResult = yield* Effect.tryPromise(() =>
          window.ernie.importPrimeAgentSession(sessionPath),
        );
        const result = parsePrimeAgentSessionResult(rawResult);
        if (!result.ok) {
          yield* Effect.sync(() => setStatus(result.error.message));
          return;
        }

        yield* Effect.sync(() => {
          connectAgentSession(result.value);
          setStatus('Saved Agent imported.');
        });
      },
    );

    Effect.runFork(
      importSavedSession().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not import the saved Agent.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setImportingSessionPath(null))),
      ),
    );
  }

  function renameSession(rename: PrimeAgentSessionRename): void {
    if (renamingSession) return;

    const persistRename = Effect.fn('Workspace.renameSession')(function* () {
      yield* Effect.sync(() => {
        setRenamingSession(true);
        setStatus('Renaming Agent conversation…');
      });
      const rawResult = yield* Effect.tryPromise(() =>
        window.ernie.renamePrimeAgentSession(rename),
      );
      const result = parsePrimeAgentSessionRenameResult(rawResult);
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        if (rename.kind === 'live') {
          setWorkspace((current) =>
            current === null
              ? null
              : {
                  ...current,
                  sessions: current.sessions.map((session) =>
                    session.activeSessionId === rename.activeSessionId
                      ? { ...session, name: result.value.name }
                      : session,
                  ),
                },
          );
        }

        const renamedPath = rename.sessionPath;
        if (renamedPath !== null) {
          setSavedSessions((current) =>
            current.map((session) =>
              session.path === renamedPath
                ? { ...session, name: result.value.name }
                : session,
            ),
          );
        }
        setStatus(`Renamed Agent conversation to ${result.value.name}.`);
      });
    });

    Effect.runFork(
      persistRename().pipe(
        Effect.catchAll(() =>
          Effect.sync(() =>
            setStatus('Ernie could not rename the Agent conversation.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setRenamingSession(false))),
      ),
    );
  }

  function selectSession(activeSessionId: string): void {
    const session = workspace?.sessions.find(
      (candidate) => candidate.activeSessionId === activeSessionId,
    );
    if (session === undefined) return;

    setSelectedCwd(session.cwd);
    setSelectedSessionId(session.activeSessionId);
    setGitWorktreeError(null);
    setStatus('Connected to Prime Agent.');
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
      yield* Effect.sync(() => {
        setAddedCwds((current) =>
          current.includes(cwd) ? current : [...current, cwd],
        );
        setSelectedCwd(cwd);
        setSelectedSessionId(null);
        setStatus('New Agent workspace selected.');
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

  const changeModel = useCallback(function changeModel(
    modelKey: string | null,
  ): void {
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
  }, [models, selectedSession]);

  function changeGitBranch(name: string | null): void {
    if (name === null || selectedCwd === null || name === gitBranch) return;
    const cwd = selectedCwd;
    const branchName = name;

    const switchGitBranch = Effect.fn('Workspace.switchGitBranch')(
      function* () {
        yield* Effect.sync(() => {
          setGitBranchBusy(true);
          setGitWorktreeError(null);
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
        setGitWorktreeError(null);
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

  function initializeGitRepository(): void {
    if (selectedCwd === null || gitBranches.length > 0) return;
    const cwd = selectedCwd;

    const initializeGit = Effect.fn('Workspace.initializeGit')(function* () {
      yield* Effect.sync(() => {
        setGitBranchBusy(true);
        setGitWorktreeError(null);
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

  function createGitWorktree(branchName: string): void {
    if (selectedCwd === null) return;
    const cwd = selectedCwd;

    const createWorktree = Effect.fn('Workspace.createGitWorktree')(
      function* () {
        yield* Effect.sync(() => {
          setGitBranchBusy(true);
          setGitWorktreeError(null);
          setStatus(`Creating worktree for ${branchName}…`);
        });
        const rawResult = yield* Effect.tryPromise(() =>
          window.ernie.createPrimeAgentGitWorktree({ cwd, branchName }),
        );
        const result = parsePrimeAgentGitWorktreeResult(rawResult);
        if (!result.ok) {
          yield* Effect.sync(() => {
            setGitWorktreeError(result.error.message);
            setStatus(result.error.message);
          });
          return;
        }

        yield* Effect.sync(() => {
          setAddedCwds((current) =>
            current.includes(result.value.cwd)
              ? current
              : [...current, result.value.cwd],
          );
          setGitBranch(result.value.branchName);
          setGitBranches((current) =>
            current.includes(result.value.branchName)
              ? current
              : [...current, result.value.branchName],
          );
          if (result.value.cwd !== cwd) {
            skipGitBranchLoadForCwd.current = result.value.cwd;
          }
          setSelectedCwd(result.value.cwd);
          setSelectedSessionId(null);
          setStatus(`Created worktree for ${result.value.branchName}.`);
        });
      },
    );

    Effect.runFork(
      createWorktree().pipe(
        Effect.catchAll(() =>
          Effect.sync(() => {
            const message = 'Ernie could not connect to local Git.';
            setGitWorktreeError(message);
            setStatus(message);
          }),
        ),
        Effect.ensuring(Effect.sync(() => setGitBranchBusy(false))),
      ),
    );
  }

  const changeRlmMaxDepth = useCallback(function changeRlmMaxDepth(
    value: string | null,
  ): void {
    if (value === null) return;
    const maxDepth = Number(value);
    if (
      !Number.isSafeInteger(maxDepth) ||
      maxDepth < 0 ||
      maxDepth > maximumRlmMaxDepth
    ) {
      return;
    }
    setRlmMaxDepth(maxDepth);
    setStatus(`RLM max depth set to ${maxDepth} for the next Agent.`);
  }, []);

  const modelBusy = loadingWorkspace || loadingSession || savingModel;
  const rlmMaxDepthBusy = loadingWorkspace;
  const primeAgentConnection = loadingWorkspace
    ? 'connecting'
    : workspace === null
      ? 'unavailable'
      : 'ready';

  return {
    busy:
      modelBusy ||
      rlmMaxDepthBusy ||
      choosingDirectory ||
      loadingSavedSessions ||
      importingSessionPath !== null ||
      renamingSession ||
      creatingAgent ||
      gitBranchBusy,
    creatingAgent,
    folders,
    gitBranch,
    gitBranchBusy,
    gitBranches,
    gitWorktreeError,
    loadingWorkspace,
    loadingSavedSessions,
    importingSessionPath,
    renamingSession,
    modelBusy,
    models,
    primeAgentConnection,
    skills,
    repoName: selectedCwd === null ? 'work' : folderName(selectedCwd),
    rlmMaxDepth,
    rlmMaxDepthBusy,
    selectedCwd,
    selectedModelKey,
    selectedSessionId,
    sessions: workspace?.sessions ?? [],
    savedSessions,
    status,
    changeFolder,
    startAgentDraft,
    createAgentWithTask,
    loadSavedSessions,
    importSession,
    renameSession,
    selectSession,
    chooseWorkspaceDirectory,
    changeGitBranch,
    deleteGitBranch,
    initializeGitRepository,
    createGitWorktree,
    changeModel,
    changeRlmMaxDepth,
  };
}

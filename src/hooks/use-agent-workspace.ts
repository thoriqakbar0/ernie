import { Effect, Fiber } from 'effect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createAgentSessionViewCache } from '@/packages/ernie-daemon/session-view-cache';
import type { AgentRendererClients } from '@/packages/agent-renderer-client';
import {
  agentWorkspaceName,
  connectAgentWorkspaceSession,
  createAgentWithTask as runAgentCreation,
  projectAgentWorkspaceControls,
  projectAgentWorkspaceFolders,
  selectInitialAgentWorkspace,
  type AgentWorkspaceController,
  type AgentWorkspaceSelectedIdentity,
  type AgentWorkspaceSpawnedTarget,
  type CreateAgentWithTaskResult,
} from '@/packages/agent-workspace';
import type { PrimeAgentGitWorkspace } from '@/packages/prime-agent-daemon/git-client';
import {
  type PrimeAgentConfiguration,
  type PrimeAgentModel,
  type PrimeAgentResult,
  type PrimeAgentSavedSession,
  type PrimeAgentSession,
  type PrimeAgentSessionRename,
  type PrimeAgentSkill,
  type PrimeAgentThinkingLevel,
  type PrimeAgentWorkspace,
} from '@/packages/prime-agent-daemon/client';
import {
  createPrimeAgentSessionFeedState,
  primeAgentSessionFeedView,
  prependPrimeAgentSessionHistory,
  reducePrimeAgentSessionFeed,
  replacePrimeAgentSessionFeedRlmDepth,
  type PrimeAgentSessionFeedState,
} from '@/packages/prime-agent-daemon/events';
import type { PrimeAgentWorkspaceConnection } from '@/packages/prime-agent-daemon/types';

const defaultRlmMaxDepth = 1;
const defaultThinkingLevel = 'medium' satisfies PrimeAgentThinkingLevel;
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

interface OwnedEarlierHistoryLoad {
  readonly activeSessionId: string;
  fiber: Fiber.Fiber<void> | null;
}

/** Connect Ernie's task controls to the local Prime Agent daemon. */
export function useAgentWorkspace(
  clients: AgentRendererClients,
): AgentWorkspaceController {
  const { agent, localWorkspace } = clients;
  const [workspace, setWorkspace] = useState<PrimeAgentWorkspace | null>(null);
  const [addedCwds, setAddedCwds] = useState<readonly string[]>([]);
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedSpawnedSession, setSelectedSpawnedSession] =
    useState<AgentWorkspaceSpawnedTarget | null>(null);
  const [selectedSessionFeed, setSelectedSessionFeedState] =
    useState<PrimeAgentSessionFeedState | null>(null);
  const [models, setModels] = useState<readonly PrimeAgentModel[]>([]);
  const [newAgentModelKey, setNewAgentModelKey] = useState<string | null>(null);
  const [newAgentThinkingLevel, setNewAgentThinkingLevel] =
    useState<PrimeAgentThinkingLevel>(defaultThinkingLevel);
  const [sessionConfiguration, setSessionConfiguration] =
    useState<PrimeAgentConfiguration | null>(null);
  const [skills, setSkills] = useState<readonly PrimeAgentSkill[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitBranches, setGitBranches] = useState<readonly string[]>([]);
  const [rlmMaxDepth, setRlmMaxDepth] = useState(loadStoredRlmMaxDepth);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [primeAgentConnection, setPrimeAgentConnection] =
    useState<PrimeAgentWorkspaceConnection>('connecting');
  const [loadingSavedSessions, setLoadingSavedSessions] = useState(false);
  const [loadingEarlierHistory, setLoadingEarlierHistory] = useState(false);
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
  const [savingThinkingLevel, setSavingThinkingLevel] = useState(false);
  const [savingSessionRlmMaxDepth, setSavingSessionRlmMaxDepth] =
    useState(false);
  const [gitBranchBusy, setGitBranchBusy] = useState(false);
  const [gitWorktreeError, setGitWorktreeError] = useState<string | null>(null);
  const [gitWorkspaces, setGitWorkspaces] = useState<
    ReadonlyMap<string, PrimeAgentGitWorkspace>
  >(new Map());
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [status, setStatus] = useState('');
  const selectedSessionFeedRef = useRef<PrimeAgentSessionFeedState | null>(null);
  const earlierHistoryLoadRef = useRef<OwnedEarlierHistoryLoad | null>(null);
  const sessionViewCacheRef = useRef<ReturnType<
    typeof createAgentSessionViewCache
  > | null>(null);
  if (sessionViewCacheRef.current === null) {
    sessionViewCacheRef.current = createAgentSessionViewCache();
  }
  const sessionViewCache = sessionViewCacheRef.current;
  const updateSelectedSessionFeed = useCallback(
    function updateSelectedSessionFeed(
      update: (
        current: PrimeAgentSessionFeedState | null,
      ) => PrimeAgentSessionFeedState | null,
    ): PrimeAgentSessionFeedState | null {
      const current = selectedSessionFeedRef.current;
      const next = update(current);
      if (next === current) return current;
      selectedSessionFeedRef.current = next;
      setSelectedSessionFeedState(next);
      return next;
    },
    [],
  );
  const cancelEarlierHistoryLoad = useCallback(
    function cancelEarlierHistoryLoad(): void {
      const owner = earlierHistoryLoadRef.current;
      if (owner === null) return;
      earlierHistoryLoadRef.current = null;
      if (owner.fiber !== null) {
        Effect.runFork(Fiber.interrupt(owner.fiber));
      }
    },
    [],
  );
  const skipGitBranchLoadForCwd = useRef<string | null>(null);
  const liveSelectedSessionView = selectedSessionFeed === null
    ? null
    : primeAgentSessionFeedView(selectedSessionFeed);
  const selectedSessionView =
    liveSelectedSessionView?.activeSessionId === selectedSessionId
      ? liveSelectedSessionView
      : selectedSessionId === null
        ? null
        : sessionViewCache.peek(selectedSessionId);
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
    setStatus('Connecting to Prime Agent…');
    const subscription = agent.watchWorkspace((result) => {
      if (!active) return;
      if (!result.ok) {
        setStatus(result.error.message);
        return;
      }
      const item = result.value;
      if (item.kind === 'connection-changed') {
        setPrimeAgentConnection(item.status);
        setLoadingWorkspace(false);
        setStatus(
          item.status === 'ready'
            ? 'Connected to Prime Agent.'
            : item.status === 'connecting'
              ? 'Connecting to Prime Agent…'
              : item.status === 'reconnecting'
                ? 'Prime Agent is reconnecting…'
                : 'The Prime Agent daemon is not available.',
        );
        return;
      }

      const nextWorkspace = item.workspace;
      const initialSelection = selectInitialAgentWorkspace(nextWorkspace);
      setWorkspace(nextWorkspace);
      setLoadingWorkspace(false);
      setSelectedCwd((current) => current ?? initialSelection.cwd);
      setSelectedSessionId((current) => current ?? initialSelection.sessionId);
    });
    const loadInitialSavedSessions = Effect.fn(
      'Workspace.loadInitialSavedSessions',
    )(function* () {
      yield* Effect.sync(() => setLoadingSavedSessions(true));
      const result = yield* Effect.tryPromise(() =>
        agent.listSavedSessions(),
      );
      if (!active) return;
      if (result.ok) yield* Effect.sync(() => setSavedSessions(result.value));
    });
    const savedSessionsFiber = Effect.runFork(
      loadInitialSavedSessions().pipe(
        Effect.catch(() => Effect.void),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setLoadingSavedSessions(false);
          }),
        ),
      ),
    );

    return () => {
      active = false;
      subscription.close();
      Effect.runFork(Fiber.interrupt(savedSessionsFiber));
    };
  }, [agent]);

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
        const result = yield* Effect.tryPromise(() =>
          localWorkspace.listBranches(cwd),
        );
        if (!active) return;
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
        Effect.catch(() =>
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
  }, [localWorkspace, selectedCwd]);

  useEffect(() => {
    if (selectedSessionId === null) {
      updateSelectedSessionFeed(() => null);
    }

    const activeSessionId = selectedSessionId;
    let active = true;
    const loadSessionControls = Effect.fn('Workspace.loadSessionControls')(
      function* () {
        yield* Effect.sync(() => setLoadingSession(true));
        const modelScope =
          activeSessionId === null
            ? ({ kind: 'draft' } as const)
            : ({ kind: 'session', activeSessionId } as const);
        const loadSkills =
          activeSessionId === null
            ? Effect.succeed<PrimeAgentResult<readonly PrimeAgentSkill[]>>({
                ok: true,
                value: [],
              })
            : Effect.tryPromise(() =>
                agent.listSkills(activeSessionId),
              );
        const loadConfiguration =
          activeSessionId === null
            ? Effect.succeed(null)
            : Effect.tryPromise(() =>
                agent.getConfiguration(activeSessionId),
              );
        const [modelResult, skillsResult, configurationResult] = yield* Effect.all(
          [
            Effect.tryPromise(() =>
              agent.listModels(modelScope),
            ),
            loadSkills,
            loadConfiguration,
          ],
          { concurrency: 'unbounded' },
        );
        if (!active) return;
        yield* Effect.sync(() => {
          setModels(modelResult.ok ? modelResult.value : []);
          if (activeSessionId === null && modelResult.ok) {
            setNewAgentModelKey((current) =>
              modelResult.value.some((model) => model.key === current)
                ? current
                : (modelResult.value[0]?.key ?? null),
            );
          }
          setSkills(skillsResult.ok ? skillsResult.value : []);
          setSessionConfiguration(
            configurationResult?.ok ? configurationResult.value : null,
          );
          if (!modelResult.ok) setStatus(modelResult.error.message);
          else if (!skillsResult.ok) setStatus(skillsResult.error.message);
          else if (configurationResult !== null && !configurationResult.ok) {
            setStatus(configurationResult.error.message);
          }
          else setStatus('Connected to Prime Agent.');
        });
      },
    );
    const fiber = Effect.runFork(
      loadSessionControls().pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            if (!active) return;
            setModels([]);
            setSkills([]);
            setSessionConfiguration(null);
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
  }, [agent, selectedSessionId, updateSelectedSessionFeed]);

  useEffect(() => {
    cancelEarlierHistoryLoad();
    setLoadingEarlierHistory(false);
    if (selectedSessionId === null) {
      updateSelectedSessionFeed(() => null);
      return;
    }

    const activeSessionId = selectedSessionId;
    sessionViewCache.read(activeSessionId);
    const subscription = agent.watchSession(
      activeSessionId,
      (envelope) => {
        if (!envelope.ok) {
          setStatus(envelope.error.message);
          return;
        }
        const current = selectedSessionFeedRef.current;
        if (current === null) return;
        const next = updateSelectedSessionFeed((state) =>
          state === null
            ? null
            : reducePrimeAgentSessionFeed(state, envelope.value)
        );
        if (next === current) return;

        const item = envelope.value.item;
        if (next?.kind === 'closed' && item.kind !== 'closed') {
          setStatus(next.failure.message);
          return;
        }
        const nextView = next === null ? null : primeAgentSessionFeedView(next);
        if (
          nextView !== null &&
          item.kind !== 'closed' &&
          item.kind !== 'connection-changed'
        ) {
          sessionViewCache.put(nextView);
        }

        const sessionName = item.kind === 'snapshot'
          ? item.view.sessionName
          : item.kind === 'session-name-changed'
            ? item.sessionName
            : null;
        if (sessionName !== null) {
          setWorkspace((current) =>
            current === null
              ? null
              : {
                  ...current,
                  sessions: current.sessions.map((session) =>
                    session.activeSessionId === activeSessionId
                      ? { ...session, name: sessionName }
                      : session,
                  ),
                },
          );
        }

        if (item.kind === 'connection-changed') {
          setStatus(
            item.status === 'live'
              ? 'Connected to Prime Agent.'
              : 'Prime Agent is reconnecting…',
          );
        } else if (item.kind === 'closed') {
          setStatus(item.failure.message);
        }
      },
    );
    updateSelectedSessionFeed(
      () => createPrimeAgentSessionFeedState(subscription.id, activeSessionId),
    );

    return () => {
      subscription.close();
      const historyOwner = earlierHistoryLoadRef.current;
      if (historyOwner?.activeSessionId === activeSessionId) {
        cancelEarlierHistoryLoad();
      }
    };
  }, [
    cancelEarlierHistoryLoad,
    agent,
    selectedSessionId,
    sessionViewCache,
    updateSelectedSessionFeed,
  ]);

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
              localWorkspace.readWorkspace(cwd),
            ).pipe(
              Effect.map((result) =>
                result.ok ? ([cwd, result.value] as const) : null,
              ),
              Effect.catch(() => Effect.succeed(null)),
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
  }, [localWorkspace, workspacePaths]);

  const folders = useMemo(
    () => projectAgentWorkspaceFolders(workspacePaths, gitWorkspaces),
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
  const selectedAgentIdentity: AgentWorkspaceSelectedIdentity | null =
    selectedSessionId === null
      ? null
      : selectedSpawnedSession?.activeSessionId === selectedSessionId
        ? {
            kind: 'spawned',
            name: selectedSpawnedSession.name,
            number: selectedSpawnedSession.number,
          }
        : {
            kind: 'prime',
            name:
              selectedSession?.name ??
              selectedSessionView?.sessionName ??
              'Untitled Agent',
          };
  const {
    selectedModelKey,
    selectedThinkingLevel,
    thinkingLevels,
  } = projectAgentWorkspaceControls({
    configuration: sessionConfiguration,
    draftModelKey: newAgentModelKey,
    draftThinkingLevel: newAgentThinkingLevel,
    models,
    selectedSessionId,
  });
  const newAgentModel = models.find((model) => model.key === newAgentModelKey) ?? null;

  function connectAgentSession(session: PrimeAgentSession): void {
    setWorkspace((current) => connectAgentWorkspaceSession(current, session));
    setSelectedCwd(session.cwd);
    setSelectedSessionId(session.activeSessionId);
  }

  function changeFolder(cwd: string | null): void {
    if (cwd === null) return;
    setSelectedCwd(cwd);
    setSelectedSessionId(null);
    setSessionConfiguration(null);
    setGitWorktreeError(null);
    setStatus('New Agent workspace selected.');
  }

  function startAgentDraft(cwd: string): void {
    setSelectedCwd(cwd);
    setSelectedSessionId(null);
    setSessionConfiguration(null);
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
    setCreatingAgent(true);
    setStatus('Creating a new Agent…');
    return runAgentCreation(
      {
        createSession: agent.createSession,
        setModel: agent.setModel,
        setThinkingLevel: agent.setThinkingLevel,
        submitTask: agent.submitTask,
      },
      {
        cwd,
        message,
        model: newAgentModel,
        rlmMaxDepth,
        thinkingLevel: selectedThinkingLevel,
      },
    ).then((outcome): CreateAgentWithTaskResult => {
      setSessionConfiguration(outcome.configuration);
      if (outcome.session !== null) connectAgentSession(outcome.session);
      if (outcome.ok) {
        setStatus('Task sent to Prime Agent.');
        return { ok: true };
      }
      if (outcome.unexpected) {
        console.error('New Agent setup failed.', {
          name: outcome.causeName ?? 'NonError',
        });
      }
      setStatus(outcome.message);
      return { ok: false, message: outcome.message };
    }).finally(() => setCreatingAgent(false));
  }

  function loadSavedSessions(): void {
    if (loadingSavedSessions) return;

    const load = Effect.fn('Workspace.loadSavedSessions')(function* () {
      yield* Effect.sync(() => {
        setLoadingSavedSessions(true);
        setStatus('Loading saved Prime Agent sessions…');
      });
      const result = yield* Effect.tryPromise(() =>
        agent.listSavedSessions(),
      );
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
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('Ernie could not load saved Prime Agent sessions.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setLoadingSavedSessions(false))),
      ),
    );
  }

  function loadEarlierSessionHistory(): void {
    if (
      earlierHistoryLoadRef.current !== null ||
      selectedSessionView === null ||
      selectedSessionView.historyStart === 0
    ) {
      return;
    }
    const activeSessionId = selectedSessionView.activeSessionId;
    const before = selectedSessionView.historyStart;
    const load = Effect.fn('Workspace.loadEarlierSessionHistory')(function* () {
      yield* Effect.sync(() => {
        setLoadingEarlierHistory(true);
        setStatus('Loading earlier Agent history…');
      });
      const result = yield* Effect.tryPromise(() =>
        agent.loadHistory({ activeSessionId, before }),
      );
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }
      yield* Effect.sync(() => {
        updateSelectedSessionFeed((current) => {
          if (current === null) return null;
          const next = prependPrimeAgentSessionHistory(current, result.value);
          const nextView = primeAgentSessionFeedView(next);
          if (nextView !== null) sessionViewCache.put(nextView);
          return next;
        });
        setStatus('Loaded earlier Agent history.');
      });
    });

    const owner: OwnedEarlierHistoryLoad = {
      activeSessionId,
      fiber: null,
    };
    earlierHistoryLoadRef.current = owner;
    owner.fiber = Effect.runFork(
      load().pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('Ernie could not load earlier Agent history.'),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (earlierHistoryLoadRef.current !== owner) return;
            earlierHistoryLoadRef.current = null;
            setLoadingEarlierHistory(false);
          }),
        ),
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
        const result = yield* Effect.tryPromise(() =>
          agent.importSession(sessionPath),
        );
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
        Effect.catch(() =>
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
      const result = yield* Effect.tryPromise(() =>
        agent.renameSession(rename),
      );
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
        Effect.catch(() =>
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
    setSessionConfiguration(null);
    setGitWorktreeError(null);
    setStatus('Connected to Prime Agent.');
  }

  function openSpawnedSession(target: AgentWorkspaceSpawnedTarget): void {
    setSelectedSpawnedSession(target);
    setSelectedSessionId(target.activeSessionId);
    setSessionConfiguration(null);
    setStatus('Opened spawned Agent conversation.');
  }

  function pickWorkspaceDirectory(select: boolean): Promise<string | null> {
    const chooseDirectory = Effect.fn('Workspace.chooseDirectory')(function* () {
      yield* Effect.sync(() => {
        setChoosingDirectory(true);
        setStatus('Choosing a workspace directory…');
      });
      const selection = yield* Effect.tryPromise(() =>
        localWorkspace.chooseDirectory(),
      );
      if (!selection.ok) {
        yield* Effect.sync(() =>
          setStatus('Ernie received an invalid directory selection.'),
        );
        return null;
      }
      if (selection.value === null) {
        yield* Effect.sync(() => setStatus('Directory selection canceled.'));
        return null;
      }

      const cwd = selection.value;
      yield* Effect.sync(() => {
        setAddedCwds((current) =>
          current.includes(cwd) ? current : [...current, cwd],
        );
        if (select) {
          setSelectedCwd(cwd);
          setSelectedSessionId(null);
        }
        setStatus(select ? 'New Agent workspace selected.' : 'Repository added.');
      });
      return cwd;
    });

    return Effect.runPromise(
      chooseDirectory().pipe(
        Effect.catch(() =>
          Effect.sync(() => {
            setStatus('Ernie could not open the directory picker.');
            return null;
          }),
        ),
        Effect.ensuring(Effect.sync(() => setChoosingDirectory(false))),
      ),
    );
  }

  function chooseWorkspaceDirectory(): void {
    void pickWorkspaceDirectory(true);
  }

  function addWorkspaceDirectory(): Promise<string | null> {
    return pickWorkspaceDirectory(false);
  }

  const changeModel = useCallback(function changeModel(
    modelKey: string | null,
  ): void {
    if (modelKey === null) return;
    const model = models.find((candidate) => candidate.key === modelKey);
    if (model === undefined) return;
    if (selectedSessionId === null) {
      setNewAgentModelKey(model.key);
      setNewAgentThinkingLevel((current) => {
        const controls = projectAgentWorkspaceControls({
          configuration: null,
          draftModelKey: model.key,
          draftThinkingLevel: current,
          models: [model],
          selectedSessionId: null,
        });
        return controls.selectedThinkingLevel ?? defaultThinkingLevel;
      });
      setStatus(`Model set to ${model.name} for the next Agent.`);
      return;
    }

    const activeSessionId = selectedSessionId;
    const provider = model.provider;
    const modelId = model.id;

    const updateModel = Effect.fn('Workspace.updateModel')(function* () {
      yield* Effect.sync(() => setSavingModel(true));
      const result = yield* Effect.tryPromise(() =>
        agent.setModel({
          activeSessionId,
          provider,
          modelId,
        }),
      );
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        setSessionConfiguration(result.value);
        setWorkspace((current) =>
          current === null
            ? null
            : {
                ...current,
                sessions: current.sessions.map((session) =>
                  session.activeSessionId === activeSessionId
                    ? { ...session, model: result.value.model }
                    : session,
                ),
              },
        );
        setStatus(`Model changed to ${result.value.model.name}.`);
      });
    });

    Effect.runFork(
      updateModel().pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('The Prime Agent daemon is not available.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setSavingModel(false))),
      ),
    );
  }, [agent, models, selectedSessionId]);

  const changeThinkingLevel = useCallback(function changeThinkingLevel(
    value: string | null,
  ): void {
    const thinkingLevel = thinkingLevels.find((level) => level === value);
    if (thinkingLevel === undefined) return;
    if (selectedSessionId === null) {
      setNewAgentThinkingLevel(thinkingLevel);
      setStatus(
        `Reasoning effort set to ${thinkingLevel} for the next Agent.`,
      );
      return;
    }

    const activeSessionId = selectedSessionId;
    const updateThinkingLevel = Effect.fn(
      'Workspace.updateThinkingLevel',
    )(function* () {
      yield* Effect.sync(() => setSavingThinkingLevel(true));
      const result = yield* Effect.tryPromise(() =>
        agent.setThinkingLevel({
          activeSessionId,
          thinkingLevel,
        }),
      );
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }
      yield* Effect.sync(() => {
        setSessionConfiguration(result.value);
        setStatus(
          `Reasoning effort changed to ${result.value.thinkingLevel}.`,
        );
      });
    });

    Effect.runFork(
      updateThinkingLevel().pipe(
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('The Prime Agent daemon is not available.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setSavingThinkingLevel(false))),
      ),
    );
  }, [agent, selectedSessionId, thinkingLevels]);

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
        const result = yield* Effect.tryPromise(() =>
          localWorkspace.switchBranch({
            cwd,
            name: branchName,
          }),
        );
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
        Effect.catch(() =>
          Effect.sync(() =>
            setStatus('Ernie could not connect to local Git.'),
          ),
        ),
        Effect.ensuring(Effect.sync(() => setGitBranchBusy(false))),
      ),
    );
  }

  function deleteGitBranch(
    name: string,
    repositoryCwd = selectedCwd ?? undefined,
    worktreeCwd?: string,
  ): void {
    if (
      repositoryCwd === undefined ||
      (worktreeCwd === undefined && name === gitBranch)
    ) {
      return;
    }
    const cwd = repositoryCwd;

    const deleteBranch = Effect.fn('Workspace.deleteGitBranch')(function* () {
      yield* Effect.sync(() => {
        setGitBranchBusy(true);
        setGitWorktreeError(null);
        setStatus(`Deleting local Git branch ${name}…`);
      });
      const result = yield* Effect.tryPromise(() =>
        localWorkspace.deleteBranch({
          cwd,
          name,
        }),
      );
      if (!result.ok) {
        yield* Effect.sync(() => setStatus(result.error.message));
        return;
      }

      yield* Effect.sync(() => {
        if (worktreeCwd === undefined) {
          setGitBranch(result.value.current);
          setGitBranches(result.value.names);
        } else {
          setGitBranches((current) =>
            current.filter((candidate) => candidate !== name),
          );
          setAddedCwds((current) =>
            current.filter((candidate) => candidate !== worktreeCwd),
          );
          setGitWorkspaces((current) => {
            const next = new Map(current);
            next.delete(worktreeCwd);
            return next;
          });
          if (selectedCwd === worktreeCwd) {
            setGitBranch(result.value.current);
            setSelectedCwd(repositoryCwd);
            setSelectedSessionId(null);
          }
        }
        setStatus(`Deleted local Git branch ${name}.`);
      });
    });

    Effect.runFork(
      deleteBranch().pipe(
        Effect.catch(() =>
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
      const result = yield* Effect.tryPromise(() =>
        localWorkspace.initializeGit(cwd),
      );
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
        Effect.catch(() =>
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
        const result = yield* Effect.tryPromise(() =>
          localWorkspace.createWorktree({ cwd, branchName }),
        );
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
        Effect.catch(() =>
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

  const changeSelectedSessionRlmMaxDepth = useCallback(
    function changeSelectedSessionRlmMaxDepth(value: string | null): void {
      if (value === null || selectedSessionId === null) return;
      const maxDepth = Number(value);
      if (
        !Number.isSafeInteger(maxDepth) ||
        maxDepth < 0 ||
        maxDepth > maximumRlmMaxDepth ||
        maxDepth === selectedSessionView?.rlmMaxDepth
      ) {
        return;
      }
      const activeSessionId = selectedSessionId;

      const updateDepth = Effect.fn('Workspace.updateSessionRlmMaxDepth')(
        function* () {
          yield* Effect.sync(() => setSavingSessionRlmMaxDepth(true));
          const result = yield* Effect.tryPromise(() =>
            agent.setRlmDepth({
              activeSessionId,
              maxDepth,
            }),
          );
          if (!result.ok) {
            yield* Effect.sync(() => setStatus(result.error.message));
            return;
          }

          yield* Effect.sync(() => {
            updateSelectedSessionFeed((current) => {
              if (current === null) return null;
              const next = replacePrimeAgentSessionFeedRlmDepth(
                current,
                activeSessionId,
                result.value.maxDepth,
              );
              const nextView = primeAgentSessionFeedView(next);
              if (nextView !== null) sessionViewCache.put(nextView);
              return next;
            });
            setStatus(
              `RLM max depth changed to ${result.value.maxDepth} for this Agent.`,
            );
          });
        },
      );

      Effect.runFork(
        updateDepth().pipe(
          Effect.catch(() =>
            Effect.sync(() =>
              setStatus('The Prime Agent daemon is not available.'),
            ),
          ),
          Effect.ensuring(
            Effect.sync(() => setSavingSessionRlmMaxDepth(false)),
          ),
        ),
      );
    },
    [
      agent,
      selectedSessionId,
      selectedSessionView?.rlmMaxDepth,
      sessionViewCache,
      updateSelectedSessionFeed,
    ],
  );

  const modelBusy =
    loadingWorkspace || loadingSession || savingModel || savingThinkingLevel;
  const thinkingLevelBusy = modelBusy;
  const rlmMaxDepthBusy = loadingWorkspace;
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
    loadingEarlierHistory,
    importingSessionPath,
    renamingSession,
    modelBusy,
    models,
    primeAgentConnection,
    skills,
    repoName: selectedCwd === null ? 'work' : agentWorkspaceName(selectedCwd),
    rlmMaxDepth,
    rlmMaxDepthBusy,
    selectedCwd,
    selectedModelKey,
    selectedThinkingLevel,
    selectedAgentIdentity,
    selectedSessionId,
    selectedSessionView,
    selectedSessionRlmMaxDepth: selectedSessionView?.rlmMaxDepth ?? null,
    selectedSessionRlmMaxDepthBusy:
      loadingSession || savingSessionRlmMaxDepth,
    sessions: workspace?.sessions ?? [],
    savedSessions,
    status,
    thinkingLevelBusy,
    thinkingLevels,
    changeFolder,
    startAgentDraft,
    createAgentWithTask,
    loadSavedSessions,
    loadEarlierSessionHistory,
    importSession,
    renameSession,
    selectSession,
    openSpawnedSession,
    chooseWorkspaceDirectory,
    addWorkspaceDirectory,
    changeGitBranch,
    deleteGitBranch,
    initializeGitRepository,
    createGitWorktree,
    changeModel,
    changeThinkingLevel,
    changeRlmMaxDepth,
    changeSelectedSessionRlmMaxDepth,
  };
}

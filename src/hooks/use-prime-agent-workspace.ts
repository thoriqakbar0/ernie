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
  readonly gitBranches: readonly string[];
  readonly loadingWorkspace: boolean;
  readonly models: readonly PrimeAgentModel[];
  readonly repoName: string;
  readonly rlmDepth: number | null;
  readonly selectedCwd: string | null;
  readonly selectedModelKey: string | null;
  readonly status: string;
  readonly changeFolder: (cwd: string | null) => void;
  readonly changeGitBranch: (name: string | null) => void;
  readonly deleteGitBranch: (name: string) => void;
  readonly renameGitBranch: (currentName: string, newName: string) => void;
  readonly changeModel: (modelKey: string | null) => void;
  readonly changeRlmDepth: (maxDepth: string | null) => void;
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
  const [savingModel, setSavingModel] = useState(false);
  const [savingGitBranch, setSavingGitBranch] = useState(false);
  const [savingRlmDepth, setSavingRlmDepth] = useState(false);
  const [status, setStatus] = useState('Connecting to Prime Agent…');

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace(): Promise<void> {
      try {
        const rawResult = await window.ernie.listPrimeAgentWorkspace();
        if (cancelled) return;

        const result = parsePrimeAgentWorkspaceResult(rawResult);
        if (!result.ok) {
          setStatus(result.error.message);
          return;
        }

        setWorkspace(result.value);
        const initialCwd = result.value.sessions.some(
          (session) => session.cwd === result.value.currentCwd,
        )
          ? result.value.currentCwd
          : (result.value.sessions[0]?.cwd ?? result.value.currentCwd);
        const initialSession = newestSession(result.value.sessions, initialCwd);
        setSelectedCwd(initialCwd);
        setSelectedSessionId(initialSession?.activeSessionId ?? null);
        setStatus(
          initialSession === null
            ? 'No connected agent in this workspace.'
            : 'Connected to Prime Agent.',
        );
      } catch {
        if (!cancelled) setStatus('The Prime Agent daemon is not available.');
      } finally {
        if (!cancelled) setLoadingWorkspace(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCwd === null) {
      setGitBranch(null);
      setGitBranches([]);
      return;
    }

    const cwd = selectedCwd;
    let cancelled = false;

    async function loadGitBranches(): Promise<void> {
      try {
        const rawResult = await window.ernie.listPrimeAgentGitBranches(cwd);
        if (cancelled) return;

        const result = parsePrimeAgentGitBranchesResult(rawResult);
        setGitBranch(result.ok ? result.value.current : null);
        setGitBranches(result.ok ? result.value.names : []);
        if (!result.ok) setStatus(result.error.message);
      } catch {
        if (!cancelled) {
          setGitBranch(null);
          setGitBranches([]);
        }
      }
    }

    void loadGitBranches();
    return () => {
      cancelled = true;
    };
  }, [selectedCwd]);

  useEffect(() => {
    if (selectedSessionId === null) {
      setModels([]);
      setRlmDepth(null);
      return;
    }

    const activeSessionId = selectedSessionId;
    let cancelled = false;

    async function loadSessionControls(): Promise<void> {
      setLoadingSession(true);
      try {
        const [rawModels, rawRlmDepth] = await Promise.all([
          window.ernie.listPrimeAgentModels(activeSessionId),
          window.ernie.getPrimeAgentRlmDepth(activeSessionId),
        ]);
        if (cancelled) return;

        const modelResult = parsePrimeAgentModelsResult(rawModels);
        const rlmDepthResult = parsePrimeAgentRlmDepthResult(rawRlmDepth);
        setModels(modelResult.ok ? modelResult.value : []);
        setRlmDepth(rlmDepthResult.ok ? rlmDepthResult.value.maxDepth : null);
        if (!modelResult.ok) setStatus(modelResult.error.message);
        else if (!rlmDepthResult.ok) setStatus(rlmDepthResult.error.message);
        else setStatus('Connected to Prime Agent.');
      } catch {
        if (!cancelled) {
          setModels([]);
          setRlmDepth(null);
          setStatus('The Prime Agent daemon is not available.');
        }
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    void loadSessionControls();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const folders = useMemo(() => {
    if (workspace === null) return [];
    const paths = new Set([
      workspace.currentCwd,
      ...workspace.sessions.map((session) => session.cwd),
    ]);
    return [...paths].map((cwd) => ({ label: folderName(cwd), value: cwd }));
  }, [workspace]);

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
    if (cwd === null || workspace === null) return;
    const session = newestSession(workspace.sessions, cwd);
    setSelectedCwd(cwd);
    setSelectedSessionId(session?.activeSessionId ?? null);
    setStatus(
      session === null
        ? 'No connected agent in this workspace.'
        : 'Connected to Prime Agent.',
    );
  }

  function changeModel(modelKey: string | null): void {
    if (modelKey === null || selectedSession === null) return;
    const model = models.find((candidate) => candidate.key === modelKey);
    if (model === undefined) return;

    const activeSessionId = selectedSession.activeSessionId;
    const provider = model.provider;
    const modelId = model.id;

    async function updateModel(): Promise<void> {
      setSavingModel(true);
      try {
        const rawResult = await window.ernie.setPrimeAgentModel({
          activeSessionId,
          provider,
          modelId,
        });
        const result = parsePrimeAgentModelResult(rawResult);
        if (!result.ok) {
          setStatus(result.error.message);
          return;
        }

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
      } catch {
        setStatus('The Prime Agent daemon is not available.');
      } finally {
        setSavingModel(false);
      }
    }

    void updateModel();
  }

  function changeGitBranch(name: string | null): void {
    if (name === null || selectedCwd === null || name === gitBranch) return;
    const cwd = selectedCwd;
    const branchName = name;

    async function switchGitBranch(): Promise<void> {
      setSavingGitBranch(true);
      try {
        const rawResult = await window.ernie.switchPrimeAgentGitBranch({
          cwd,
          name: branchName,
        });
        const result = parsePrimeAgentGitBranchesResult(rawResult);
        if (!result.ok) {
          setStatus(result.error.message);
          return;
        }

        setGitBranch(result.value.current);
        setGitBranches(result.value.names);
        setStatus(`Git branch changed to ${branchName}.`);
      } catch {
        setStatus('Ernie could not connect to local Git.');
      } finally {
        setSavingGitBranch(false);
      }
    }

    void switchGitBranch();
  }

  function deleteGitBranch(name: string): void {
    if (selectedCwd === null || name === gitBranch) return;
    const cwd = selectedCwd;

    async function deleteBranch(): Promise<void> {
      setSavingGitBranch(true);
      try {
        const rawResult = await window.ernie.deletePrimeAgentGitBranch({
          cwd,
          name,
        });
        const result = parsePrimeAgentGitBranchesResult(rawResult);
        if (!result.ok) {
          setStatus(result.error.message);
          return;
        }

        setGitBranch(result.value.current);
        setGitBranches(result.value.names);
        setStatus(`Deleted local Git branch ${name}.`);
      } catch {
        setStatus('Ernie could not connect to local Git.');
      } finally {
        setSavingGitBranch(false);
      }
    }

    void deleteBranch();
  }

  function renameGitBranch(currentName: string, newName: string): void {
    if (selectedCwd === null || currentName === newName) return;
    const cwd = selectedCwd;

    async function renameBranch(): Promise<void> {
      setSavingGitBranch(true);
      try {
        const rawResult = await window.ernie.renamePrimeAgentGitBranch({
          cwd,
          currentName,
          newName,
        });
        const result = parsePrimeAgentGitBranchesResult(rawResult);
        if (!result.ok) {
          setStatus(result.error.message);
          return;
        }

        setGitBranch(result.value.current);
        setGitBranches(result.value.names);
        setStatus(`Renamed local Git branch to ${newName}.`);
      } catch {
        setStatus('Ernie could not connect to local Git.');
      } finally {
        setSavingGitBranch(false);
      }
    }

    void renameBranch();
  }

  function changeRlmDepth(value: string | null): void {
    if (value === null || selectedSession === null) return;
    const maxDepth = Number(value);
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) return;
    const activeSessionId = selectedSession.activeSessionId;

    async function updateRlmDepth(): Promise<void> {
      setSavingRlmDepth(true);
      try {
        const rawResult = await window.ernie.setPrimeAgentRlmDepth({
          activeSessionId,
          maxDepth,
        });
        const result = parsePrimeAgentRlmDepthResult(rawResult);
        if (!result.ok) {
          setStatus(result.error.message);
          return;
        }

        setRlmDepth(result.value.maxDepth);
        setStatus(`RLM depth changed to ${result.value.maxDepth}.`);
      } catch {
        setStatus('The Prime Agent daemon is not available.');
      } finally {
        setSavingRlmDepth(false);
      }
    }

    void updateRlmDepth();
  }

  return {
    busy:
      loadingWorkspace ||
      loadingSession ||
      savingModel ||
      savingRlmDepth ||
      savingGitBranch,
    folders,
    gitBranch,
    gitBranches,
    loadingWorkspace,
    models,
    repoName: selectedCwd === null ? 'work' : folderName(selectedCwd),
    rlmDepth,
    selectedCwd,
    selectedModelKey,
    status,
    changeFolder,
    changeGitBranch,
    deleteGitBranch,
    renameGitBranch,
    changeModel,
    changeRlmDepth,
  };
}

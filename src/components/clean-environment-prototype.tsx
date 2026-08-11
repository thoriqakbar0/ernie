// The selected nested repository, worktree, and thread prototype for Ernie's existing renderer route.
import {
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  GitBranch,
  Layers3,
  PanelLeft,
  Paperclip,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';

interface ThreadItem {
  readonly id: string;
  readonly title: string;
  readonly age: string;
}

interface WorktreeItem {
  readonly id: string;
  readonly branch: string;
  readonly path: string;
  readonly threads: ReadonlyArray<ThreadItem>;
}

interface RepositoryItem {
  readonly id: string;
  readonly label: string;
  readonly worktrees: ReadonlyArray<WorktreeItem>;
}

interface EnvironmentState {
  readonly repositoryId: string;
  readonly worktreeId: string;
  readonly threadId: string;
}

interface PrototypeSurfaceProps {
  readonly environment: EnvironmentState;
  readonly onEnvironmentChange: (environment: EnvironmentState) => void;
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
}

const repositories: ReadonlyArray<RepositoryItem> = [
  {
    id: 'ernie',
    label: 'ernie',
    worktrees: [
      {
        id: 'ernie-main',
        branch: 'main',
        path: '/Users/thor/work/ernie',
        threads: [
          { id: 'environment', title: 'Cleaner agent environment', age: 'now' },
          { id: 'prime-session', title: 'Prime Agent sessions', age: '12m' },
        ],
      },
      {
        id: 'ernie-clean',
        branch: 'clean-environment',
        path: '/Users/thor/.codex/worktrees/clean-environment/ernie',
        threads: [
          { id: 'sidebar', title: 'Radically clean sidebar', age: '4m' },
          { id: 'thread-controls', title: 'Thread controls', age: '1h' },
        ],
      },
    ],
  },
  {
    id: 'kastuli',
    label: 'kastuli',
    worktrees: [
      {
        id: 'kastuli-main',
        branch: 'main',
        path: '/Users/thor/work/kastuli',
        threads: [
          { id: 'landing', title: 'Refine landing page', age: '2h' },
          { id: 'search', title: 'Search interactions', age: '1d' },
        ],
      },
    ],
  },
];

const initialEnvironment: EnvironmentState = {
  repositoryId: 'ernie',
  worktreeId: 'ernie-main',
  threadId: 'environment',
};

function requireItem<T>(item: T | undefined, message: string): T {
  if (item === undefined) throw new Error(message);
  return item;
}

function findRepository(repositoryId: string): RepositoryItem {
  return requireItem(
    repositories.find((repository) => repository.id === repositoryId) ??
      repositories[0],
    'The prototype requires at least one repository.',
  );
}

function findWorktree(
  repository: RepositoryItem,
  worktreeId: string,
): WorktreeItem {
  return requireItem(
    repository.worktrees.find((worktree) => worktree.id === worktreeId) ??
      repository.worktrees[0],
    'The prototype repository requires at least one worktree.',
  );
}

function findThread(
  worktree: WorktreeItem,
  threadId: string,
): ThreadItem {
  return requireItem(
    worktree.threads.find((thread) => thread.id === threadId) ??
      worktree.threads[0],
    'The prototype worktree requires at least one thread.',
  );
}

function selectRepository(
  repositoryId: string,
  onEnvironmentChange: (environment: EnvironmentState) => void,
): void {
  const repository = findRepository(repositoryId);
  const worktree = requireItem(
    repository.worktrees[0],
    'The prototype repository requires a default worktree.',
  );
  const thread = requireItem(
    worktree.threads[0],
    'The prototype worktree requires a default thread.',
  );
  onEnvironmentChange({
    repositoryId: repository.id,
    worktreeId: worktree.id,
    threadId: thread.id,
  });
}

function selectWorktree(
  repository: RepositoryItem,
  worktreeId: string,
  onEnvironmentChange: (environment: EnvironmentState) => void,
): void {
  const worktree = findWorktree(repository, worktreeId);
  const thread = requireItem(
    worktree.threads[0],
    'The prototype worktree requires a default thread.',
  );
  onEnvironmentChange({
    repositoryId: repository.id,
    worktreeId: worktree.id,
    threadId: thread.id,
  });
}

function AppChrome({
  sidebarWidth,
  sidebar,
  children,
}: {
  readonly sidebarWidth: string;
  readonly sidebar: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 bg-[#0d0d0b] text-[#eeeae2]">
      <aside
        className={`${sidebarWidth} flex min-h-0 shrink-0 flex-col border-r border-white/[0.07] bg-[#11110f]`}
      >
        {sidebar}
        <div className="mt-auto flex h-14 shrink-0 items-center justify-between border-t border-white/[0.07] px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-[#f2eee6] text-[#171612]">
              <Sparkles className="size-3.5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium">Ernie</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/38">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Prime Agent ready
              </p>
            </div>
          </div>
          <IconButton label="Settings">
            <Settings className="size-3.5" />
          </IconButton>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#0d0d0b]">
        <header className="flex h-12 shrink-0 items-center justify-between px-4">
          <IconButton label="Toggle sidebar">
            <PanelLeft className="size-4" />
          </IconButton>
          <div className="flex items-center gap-1">
            <span className="mr-2 text-[11px] text-white/28">prototype</span>
            <IconButton label="Search">
              <Search className="size-4" />
            </IconButton>
            <IconButton label="View options">
              <SlidersHorizontal className="size-4" />
            </IconButton>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function IconButton({
  label,
  children,
  onClick,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly onClick?: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="grid size-7 place-items-center rounded-lg text-white/46 transition-colors hover:bg-white/[0.06] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SidebarHeading({
  label,
  onAdd,
}: {
  readonly label: string;
  readonly onAdd?: () => void;
}): React.JSX.Element {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-3 pl-4">
      <p className="text-[11px] font-medium tracking-[0.08em] text-white/38 uppercase">
        {label}
      </p>
      {onAdd !== undefined && (
        <IconButton label={`Add ${label}`} onClick={onAdd}>
          <Plus className="size-3.5" />
        </IconButton>
      )}
    </div>
  );
}

function Composer({
  repository,
  worktree,
  thread,
  draft,
  onDraftChange,
}: {
  readonly repository: RepositoryItem;
  readonly worktree: WorktreeItem;
  readonly thread: ThreadItem;
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
}): React.JSX.Element {
  return (
    <section className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col justify-center px-8 pb-28">
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-4 grid size-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-white/62 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <Layers3 className="size-[18px]" strokeWidth={1.7} />
        </div>
        <h1 className="text-[15px] font-medium tracking-[-0.01em] text-white/78">
          {thread.title}
        </h1>
        <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-white/30">
          One task. One environment. Everything else stays quiet.
        </p>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#1b1b18] shadow-[0_24px_80px_rgba(0,0,0,0.28)] focus-within:border-white/[0.17]">
        <div className="flex h-9 items-center gap-1.5 border-b border-white/[0.055] px-3 text-[11px] text-white/36">
          <Folder className="size-3" />
          <span className="text-white/55">{repository.label}</span>
          <span className="text-white/15">/</span>
          <GitBranch className="size-3" />
          <span>{worktree.branch}</span>
          <span className="ml-auto max-w-[260px] truncate font-mono text-[9px] text-white/18">
            {worktree.path}
          </span>
        </div>
        <textarea
          aria-label="Message Prime Agent"
          className="block h-28 w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-6 text-white/82 outline-none placeholder:text-white/24"
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Ask Prime Agent…"
          value={draft}
        />
        <div className="flex h-12 items-center justify-between px-2.5 pb-1">
          <div className="flex items-center gap-1">
            <IconButton label="Add context">
              <Paperclip className="size-4" />
            </IconButton>
            <button
              className="h-7 rounded-lg px-2 text-[11px] text-white/34 transition-colors hover:bg-white/[0.05] hover:text-white/62"
              type="button"
            >
              GPT-5.6 Sol
            </button>
          </div>
          <button
            aria-label="Send message"
            className="grid size-8 place-items-center rounded-[10px] bg-[#eeeae2] text-[#171612] transition-[opacity,transform] enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:opacity-20"
            disabled={draft.trim().length === 0}
            type="button"
          >
            <ArrowUp className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </section>
  );
}

/** Show repositories, worktrees, and threads as one quiet nested tree. */
export function VariantA({
  environment,
  onEnvironmentChange,
  draft,
  onDraftChange,
}: PrototypeSurfaceProps): React.JSX.Element {
  const repository = findRepository(environment.repositoryId);
  const worktree = findWorktree(repository, environment.worktreeId);
  const thread = findThread(worktree, environment.threadId);

  const sidebar = (
    <>
      <SidebarHeading label="Repositories" onAdd={() => undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {repositories.map((repositoryItem) => {
          const repositoryActive = repositoryItem.id === repository.id;
          return (
            <div className="mb-1" key={repositoryItem.id}>
              <button
                className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors ${repositoryActive ? 'text-white/82' : 'text-white/42 hover:bg-white/[0.035] hover:text-white/68'}`}
                onClick={() =>
                  selectRepository(repositoryItem.id, onEnvironmentChange)
                }
                type="button"
              >
                {repositoryActive ? (
                  <ChevronDown className="size-3.5 text-white/30" />
                ) : (
                  <ChevronRight className="size-3.5 text-white/24" />
                )}
                <Folder className="size-3.5 text-white/46" />
                <span className="truncate">{repositoryItem.label}</span>
              </button>

              {repositoryActive && (
                <div className="ml-[18px] border-l border-white/[0.065] pl-2">
                  {repositoryItem.worktrees.map((worktreeItem) => {
                    const worktreeActive = worktreeItem.id === worktree.id;
                    return (
                      <div className="mt-0.5" key={worktreeItem.id}>
                        <button
                          className={`group flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] transition-colors ${worktreeActive ? 'bg-white/[0.045] text-white/66' : 'text-white/30 hover:bg-white/[0.03] hover:text-white/55'}`}
                          onClick={() =>
                            selectWorktree(
                              repositoryItem,
                              worktreeItem.id,
                              onEnvironmentChange,
                            )
                          }
                          type="button"
                        >
                          <GitBranch className="size-3" />
                          <span className="truncate">{worktreeItem.branch}</span>
                          <span className="ml-auto tabular-nums text-white/20">
                            {worktreeItem.threads.length}
                          </span>
                        </button>
                        {worktreeActive && (
                          <div className="mt-0.5 space-y-0.5 pl-2">
                            {worktreeItem.threads.map((threadItem) => {
                              const threadActive =
                                threadItem.id === environment.threadId;
                              return (
                                <button
                                  className={`group flex min-h-8 w-full items-center rounded-lg px-2 text-left text-[12px] transition-colors ${threadActive ? 'bg-white/[0.075] text-white/88' : 'text-white/38 hover:bg-white/[0.035] hover:text-white/65'}`}
                                  key={threadItem.id}
                                  onClick={() =>
                                    onEnvironmentChange({
                                      repositoryId: repositoryItem.id,
                                      worktreeId: worktreeItem.id,
                                      threadId: threadItem.id,
                                    })
                                  }
                                  type="button"
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {threadItem.title}
                                  </span>
                                  <span className="ml-2 shrink-0 text-[9px] text-white/18 group-hover:text-white/30">
                                    {threadItem.age}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <AppChrome sidebar={sidebar} sidebarWidth="w-[286px]">
      <Composer
        draft={draft}
        onDraftChange={onDraftChange}
        repository={repository}
        thread={thread}
        worktree={worktree}
      />
    </AppChrome>
  );
}

/** Render the selected disposable clean-environment prototype. */
export function CleanEnvironmentPrototype(): React.JSX.Element {
  const [environment, setEnvironment] =
    useState<EnvironmentState>(initialEnvironment);
  const [draft, setDraft] = useState('');

  return (
    <div className="h-full w-full overflow-hidden">
      <VariantA
        draft={draft}
        environment={environment}
        onDraftChange={setDraft}
        onEnvironmentChange={setEnvironment}
      />
    </div>
  );
}

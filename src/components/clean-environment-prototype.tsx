// Three thread-control and composer variants, switchable via ?variant=, inside the selected nested environment prototype.
import {
  Archive,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Folder,
  GitBranch,
  GripVertical,
  Layers3,
  PanelLeft,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/trovecn/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/trovecn/ui/context-menu';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/trovecn/ui/menu';

type VariantKey = 'A' | 'B' | 'C';
type ThreadAction = 'archive' | 'rename' | 'toggle-pin';

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

interface ThreadManagementState {
  readonly archivedThreadIds: ReadonlyArray<string>;
  readonly pinnedThreadIds: ReadonlyArray<string>;
  readonly titles: Readonly<Record<string, string>>;
  readonly lastAction: string;
}

interface PrototypeSurfaceProps {
  readonly environment: EnvironmentState;
  readonly management: ThreadManagementState;
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
  readonly onEnvironmentChange: (environment: EnvironmentState) => void;
  readonly onThreadAction: (
    action: ThreadAction,
    thread: ThreadItem,
    worktree: WorktreeItem,
  ) => void;
}

interface ThreadRowProps {
  readonly selected: boolean;
  readonly pinned: boolean;
  readonly thread: ThreadItem;
  readonly title: string;
  readonly worktree: WorktreeItem;
  readonly onOpen: () => void;
  readonly onThreadAction: PrototypeSurfaceProps['onThreadAction'];
}

interface ComposerProps {
  readonly repository: RepositoryItem;
  readonly worktree: WorktreeItem;
  readonly threadTitle: string;
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

const variants: ReadonlyArray<{
  readonly key: VariantKey;
  readonly label: string;
}> = [
  { key: 'A', label: 'Reveal on hover' },
  { key: 'B', label: 'Inline controls' },
  { key: 'C', label: 'Thread inspector' },
];

const initialEnvironment: EnvironmentState = {
  repositoryId: 'ernie',
  worktreeId: 'ernie-main',
  threadId: 'environment',
};

const initialManagement: ThreadManagementState = {
  archivedThreadIds: [],
  pinnedThreadIds: [],
  titles: {},
  lastAction: 'Ready',
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

function threadTitle(
  thread: ThreadItem,
  management: ThreadManagementState,
): string {
  return management.titles[thread.id] ?? thread.title;
}

function visibleThreads(
  worktree: WorktreeItem,
  management: ThreadManagementState,
): ReadonlyArray<ThreadItem> {
  return worktree.threads
    .filter((thread) => !management.archivedThreadIds.includes(thread.id))
    .slice()
    .sort(
      (left, right) =>
        Number(management.pinnedThreadIds.includes(right.id)) -
        Number(management.pinnedThreadIds.includes(left.id)),
    );
}

function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get('variant');
  return value === 'B' || value === 'C' ? value : 'A';
}

function shouldIgnoreShortcut(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
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

function IconButton({
  label,
  children,
  onClick,
  className = '',
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly onClick?: () => void;
  readonly className?: string;
}): React.JSX.Element {
  return (
    <Button
      aria-label={label}
      className={`size-7 rounded-lg text-white/46 hover:bg-white/[0.06] hover:text-white/82 ${className}`}
      onClick={onClick}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function AppChrome({
  sidebar,
  children,
}: {
  readonly sidebar: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 bg-[#0d0d0b] text-[#eeeae2]">
      <aside className="flex w-[286px] min-h-0 shrink-0 flex-col border-r border-white/[0.07] bg-[#11110f]">
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

function ThreadContextActions({
  pinned,
  thread,
  worktree,
  onThreadAction,
}: Pick<ThreadRowProps, 'pinned' | 'thread' | 'worktree' | 'onThreadAction'>) {
  return (
    <>
      <ContextMenuItem onClick={() => onThreadAction('rename', thread, worktree)}>
        <Pencil />
        Rename
        <ContextMenuShortcut>R</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => onThreadAction('toggle-pin', thread, worktree)}
      >
        {pinned ? <PinOff /> : <Pin />}
        {pinned ? 'Unpin' : 'Pin to top'}
        <ContextMenuShortcut>P</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onClick={() => onThreadAction('archive', thread, worktree)}
      >
        <Archive />
        Archive
      </ContextMenuItem>
    </>
  );
}

function ThreadClickActions({
  pinned,
  thread,
  worktree,
  onThreadAction,
}: Pick<ThreadRowProps, 'pinned' | 'thread' | 'worktree' | 'onThreadAction'>) {
  return (
    <>
      <MenuItem onClick={() => onThreadAction('rename', thread, worktree)}>
        <Pencil />
        Rename
      </MenuItem>
      <MenuItem onClick={() => onThreadAction('toggle-pin', thread, worktree)}>
        {pinned ? <PinOff /> : <Pin />}
        {pinned ? 'Unpin' : 'Pin to top'}
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => onThreadAction('archive', thread, worktree)}>
        <Archive />
        Archive
      </MenuItem>
    </>
  );
}

function ThreadContext({
  children,
  pinned,
  thread,
  worktree,
  onThreadAction,
}: Pick<ThreadRowProps, 'pinned' | 'thread' | 'worktree' | 'onThreadAction'> & {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="min-w-0" />}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ThreadContextActions
          pinned={pinned}
          thread={thread}
          worktree={worktree}
          onThreadAction={onThreadAction}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ThreadRowA(props: ThreadRowProps): React.JSX.Element {
  return (
    <ThreadContext {...props}>
      <div className="group/thread flex min-h-8 items-center rounded-lg">
        <Button
          aria-current={props.selected ? 'page' : undefined}
          className={`h-8 min-w-0 flex-1 justify-start rounded-lg px-2 text-left text-[12px] font-normal ${props.selected ? 'bg-white/[0.075] text-white/88' : 'text-white/38 hover:bg-white/[0.035] hover:text-white/65'}`}
          onClick={props.onOpen}
          type="button"
          variant="ghost"
        >
          {props.pinned && <Pin className="size-3 text-white/35" />}
          <span className="min-w-0 flex-1 truncate">{props.title}</span>
          <span className="shrink-0 text-[9px] text-white/18">
            {props.thread.age}
          </span>
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                aria-label={`Manage ${props.title}`}
                className="mr-0.5 size-7 text-white/35 opacity-0 hover:bg-white/[0.06] group-hover/thread:opacity-100 aria-expanded:opacity-100"
                size="icon-xs"
                type="button"
                variant="ghost"
              />
            }
          >
            <Ellipsis />
          </MenuTrigger>
          <MenuContent align="start" className="w-44" side="right" sideOffset={5}>
            <ThreadClickActions {...props} />
          </MenuContent>
        </Menu>
      </div>
    </ThreadContext>
  );
}

function ThreadRowB(props: ThreadRowProps): React.JSX.Element {
  return (
    <ThreadContext {...props}>
      <div
        className={`rounded-lg transition-colors ${props.selected ? 'bg-white/[0.065]' : ''}`}
      >
        <Button
          aria-current={props.selected ? 'page' : undefined}
          className="h-8 w-full min-w-0 justify-start rounded-lg px-2 text-left text-[12px] font-normal text-white/62 hover:bg-white/[0.035]"
          onClick={props.onOpen}
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 flex-1 truncate">{props.title}</span>
          <span className="shrink-0 text-[9px] text-white/18">
            {props.thread.age}
          </span>
        </Button>
        {props.selected && (
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            <IconButton
              label={`Rename ${props.title}`}
              onClick={() =>
                props.onThreadAction('rename', props.thread, props.worktree)
              }
            >
              <Pencil className="size-3" />
            </IconButton>
            <IconButton
              label={`${props.pinned ? 'Unpin' : 'Pin'} ${props.title}`}
              onClick={() =>
                props.onThreadAction('toggle-pin', props.thread, props.worktree)
              }
            >
              {props.pinned ? (
                <PinOff className="size-3" />
              ) : (
                <Pin className="size-3" />
              )}
            </IconButton>
            <IconButton
              label={`Archive ${props.title}`}
              className="text-red-300/45 hover:text-red-300/80"
              onClick={() =>
                props.onThreadAction('archive', props.thread, props.worktree)
              }
            >
              <Archive className="size-3" />
            </IconButton>
            <span className="ml-auto pr-1 text-[9px] text-white/20">
              right-click for more
            </span>
          </div>
        )}
      </div>
    </ThreadContext>
  );
}

function ThreadRowC(props: ThreadRowProps): React.JSX.Element {
  return (
    <ThreadContext {...props}>
      <Button
        aria-current={props.selected ? 'page' : undefined}
        className={`h-8 w-full min-w-0 justify-start rounded-lg px-2 text-left text-[12px] font-normal ${props.selected ? 'bg-white/[0.075] text-white/88' : 'text-white/38 hover:bg-white/[0.035] hover:text-white/65'}`}
        onClick={props.onOpen}
        type="button"
        variant="ghost"
      >
        {props.selected && <span className="size-1 rounded-full bg-white/60" />}
        <span className="min-w-0 flex-1 truncate">{props.title}</span>
        {props.pinned ? (
          <Pin className="size-3 text-white/30" />
        ) : (
          <span className="shrink-0 text-[9px] text-white/18">
            {props.thread.age}
          </span>
        )}
      </Button>
    </ThreadContext>
  );
}

function RepositoryTree({
  controls,
  environment,
  management,
  onEnvironmentChange,
  onThreadAction,
}: Pick<
  PrototypeSurfaceProps,
  'environment' | 'management' | 'onEnvironmentChange' | 'onThreadAction'
> & {
  readonly controls: VariantKey;
}): React.JSX.Element {
  const activeRepository = findRepository(environment.repositoryId);
  const activeWorktree = findWorktree(
    activeRepository,
    environment.worktreeId,
  );
  const Row = controls === 'B' ? ThreadRowB : controls === 'C' ? ThreadRowC : ThreadRowA;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between px-3 pl-4">
        <p className="text-[11px] font-medium tracking-[0.08em] text-white/38 uppercase">
          Repositories
        </p>
        <IconButton label="Add repository">
          <Plus className="size-3.5" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {repositories.map((repository) => {
          const repositoryActive = repository.id === activeRepository.id;
          return (
            <div className="mb-1" key={repository.id}>
              <Button
                className={`h-8 w-full justify-start gap-2 rounded-lg px-2 text-left text-[13px] font-normal ${repositoryActive ? 'text-white/82' : 'text-white/42 hover:bg-white/[0.035] hover:text-white/68'}`}
                onClick={() =>
                  selectRepository(repository.id, onEnvironmentChange)
                }
                type="button"
                variant="ghost"
              >
                {repositoryActive ? (
                  <ChevronDown className="size-3.5 text-white/30" />
                ) : (
                  <ChevronRight className="size-3.5 text-white/24" />
                )}
                <Folder className="size-3.5 text-white/46" />
                <span className="truncate">{repository.label}</span>
              </Button>

              {repositoryActive && (
                <div className="ml-[18px] border-l border-white/[0.065] pl-2">
                  {repository.worktrees.map((worktree) => {
                    const worktreeActive = worktree.id === activeWorktree.id;
                    const threads = visibleThreads(worktree, management);
                    return (
                      <div className="mt-0.5" key={worktree.id}>
                        <Button
                          className={`h-7 w-full justify-start gap-2 rounded-md px-2 text-left text-[11px] font-normal ${worktreeActive ? 'bg-white/[0.045] text-white/66' : 'text-white/30 hover:bg-white/[0.03] hover:text-white/55'}`}
                          onClick={() =>
                            selectWorktree(
                              repository,
                              worktree.id,
                              onEnvironmentChange,
                            )
                          }
                          type="button"
                          variant="ghost"
                        >
                          <GitBranch className="size-3" />
                          <span className="truncate">{worktree.branch}</span>
                          <span className="ml-auto tabular-nums text-white/20">
                            {threads.length}
                          </span>
                        </Button>
                        {worktreeActive && (
                          <div className="mt-0.5 space-y-0.5 pl-2">
                            {threads.map((thread) => (
                              <Row
                                key={thread.id}
                                pinned={management.pinnedThreadIds.includes(
                                  thread.id,
                                )}
                                selected={thread.id === environment.threadId}
                                thread={thread}
                                title={threadTitle(thread, management)}
                                worktree={worktree}
                                onOpen={() =>
                                  onEnvironmentChange({
                                    repositoryId: repository.id,
                                    worktreeId: worktree.id,
                                    threadId: thread.id,
                                  })
                                }
                                onThreadAction={onThreadAction}
                              />
                            ))}
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
}

function WorkspaceIntro({ threadTitle }: { readonly threadTitle: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-white/62 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <Layers3 className="size-[18px]" strokeWidth={1.7} />
      </div>
      <h1 className="text-[15px] font-medium tracking-[-0.01em] text-white/78">
        {threadTitle}
      </h1>
      <p className="mt-1.5 max-w-sm text-[12px] leading-5 text-white/30">
        One task. One environment. Everything else stays quiet.
      </p>
    </div>
  );
}

function ComposerA({
  repository,
  worktree,
  draft,
  onDraftChange,
}: ComposerProps): React.JSX.Element {
  return (
    <div className="w-full overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#1b1b18] shadow-[0_24px_80px_rgba(0,0,0,0.28)] focus-within:border-white/[0.17]">
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
        className="block h-24 w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-6 text-white/82 outline-none placeholder:text-white/24"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the change…"
        value={draft}
      />
      <div className="flex h-11 items-center justify-between px-2.5 pb-1">
        <div className="flex items-center gap-1">
          <IconButton label="Add context">
            <Paperclip className="size-4" />
          </IconButton>
          <Button
            className="h-7 rounded-lg px-2 text-[11px] font-normal text-white/34 hover:bg-white/[0.05] hover:text-white/62"
            type="button"
            variant="ghost"
          >
            GPT-5.6 Sol
          </Button>
          <span className="hidden text-[9px] text-white/18 sm:inline">
            Enter to send · Shift Enter for line
          </span>
        </div>
        <SendButton draft={draft} />
      </div>
    </div>
  );
}

function ComposerB({
  repository,
  worktree,
  draft,
  onDraftChange,
}: ComposerProps): React.JSX.Element {
  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-center gap-1.5 text-[10px] text-white/25">
        <Folder className="size-3" />
        {repository.label}
        <span>/</span>
        <GitBranch className="size-3" />
        {worktree.branch}
      </div>
      <div className="flex min-h-14 items-end gap-1 rounded-2xl border border-white/[0.1] bg-[#1b1b18] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.25)] focus-within:border-white/[0.18]">
        <IconButton label="Add context" className="mb-0.5 shrink-0">
          <Plus className="size-4" />
        </IconButton>
        <textarea
          aria-label="Message Prime Agent"
          className="max-h-28 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-5 text-white/82 outline-none placeholder:text-white/24"
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Ask anything…"
          rows={1}
          value={draft}
        />
        <Button
          className="mb-0.5 h-7 rounded-lg px-2 text-[10px] font-normal text-white/30 hover:bg-white/[0.05]"
          type="button"
          variant="ghost"
        >
          GPT-5.6 Sol
        </Button>
        <SendButton draft={draft} />
      </div>
    </div>
  );
}

function ComposerC({
  repository,
  worktree,
  draft,
  onDraftChange,
}: ComposerProps): React.JSX.Element {
  return (
    <div className="w-full rounded-[16px] border border-white/[0.1] bg-[#181816] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.3)] focus-within:border-white/[0.18]">
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-white/45">
          {repository.label}
        </span>
        <span className="flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-white/45">
          <GitBranch className="size-3" /> {worktree.branch}
        </span>
        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-white/35">
          @ context
        </span>
        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-white/35">
          / skills
        </span>
      </div>
      <textarea
        aria-label="Message Prime Agent"
        className="block h-20 w-full resize-none rounded-xl bg-white/[0.025] px-3 py-2.5 text-[14px] leading-6 text-white/82 outline-none placeholder:text-white/24"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="What should this agent do next?"
        value={draft}
      />
      <div className="flex h-10 items-end justify-between px-1">
        <div className="flex items-center gap-1">
          <IconButton label="Attach file">
            <Paperclip className="size-4" />
          </IconButton>
          <Button
            className="h-7 rounded-lg px-2 text-[11px] font-normal text-white/32 hover:bg-white/[0.05]"
            type="button"
            variant="ghost"
          >
            GPT-5.6 Sol
          </Button>
        </div>
        <SendButton draft={draft} />
      </div>
    </div>
  );
}

function SendButton({ draft }: { readonly draft: string }): React.JSX.Element {
  return (
    <Button
      aria-label="Send message"
      className="size-8 rounded-[10px] bg-[#eeeae2] text-[#171612] hover:bg-white disabled:opacity-20"
      disabled={draft.trim().length === 0}
      size="icon-sm"
      type="button"
    >
      <ArrowUp className="size-4" strokeWidth={2.2} />
    </Button>
  );
}

function VariantShell({
  variant,
  composer,
  inspector,
  environment,
  management,
  onEnvironmentChange,
  onThreadAction,
}: Pick<
  PrototypeSurfaceProps,
  'environment' | 'management' | 'onEnvironmentChange' | 'onThreadAction'
> & {
  readonly variant: VariantKey;
  readonly composer: React.ReactNode;
  readonly inspector?: React.ReactNode;
}): React.JSX.Element {
  const repository = findRepository(environment.repositoryId);
  const worktree = findWorktree(repository, environment.worktreeId);
  const thread = findThread(worktree, environment.threadId);
  const title = threadTitle(thread, management);

  return (
    <AppChrome
      sidebar={
        <RepositoryTree
          controls={variant}
          environment={environment}
          management={management}
          onEnvironmentChange={onEnvironmentChange}
          onThreadAction={onThreadAction}
        />
      }
    >
      {inspector}
      {variant === 'C' ? (
        <section className="mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col px-8 pb-24 pt-4">
          <div className="flex flex-1 items-center justify-center pb-8">
            <WorkspaceIntro threadTitle={title} />
          </div>
          {composer}
        </section>
      ) : (
        <section className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col px-8 pb-24">
          <div className="flex flex-1 items-end justify-center pb-8">
            <WorkspaceIntro threadTitle={title} />
          </div>
          <div className="pb-8">{composer}</div>
        </section>
      )}
    </AppChrome>
  );
}

/** Reveal a compact Trove menu only when a thread row needs attention. */
export function VariantA(props: PrototypeSurfaceProps): React.JSX.Element {
  const repository = findRepository(props.environment.repositoryId);
  const worktree = findWorktree(repository, props.environment.worktreeId);
  const thread = findThread(worktree, props.environment.threadId);
  return (
    <VariantShell
      {...props}
      variant="A"
      composer={
        <ComposerA
          draft={props.draft}
          onDraftChange={props.onDraftChange}
          repository={repository}
          threadTitle={threadTitle(thread, props.management)}
          worktree={worktree}
        />
      }
    />
  );
}

/** Keep selected-thread actions visible directly beneath its row. */
export function VariantB(props: PrototypeSurfaceProps): React.JSX.Element {
  const repository = findRepository(props.environment.repositoryId);
  const worktree = findWorktree(repository, props.environment.worktreeId);
  const thread = findThread(worktree, props.environment.threadId);
  return (
    <VariantShell
      {...props}
      variant="B"
      composer={
        <ComposerB
          draft={props.draft}
          onDraftChange={props.onDraftChange}
          repository={repository}
          threadTitle={threadTitle(thread, props.management)}
          worktree={worktree}
        />
      }
    />
  );
}

/** Move selected-thread controls into a calm inspector above the workspace. */
export function VariantC(props: PrototypeSurfaceProps): React.JSX.Element {
  const repository = findRepository(props.environment.repositoryId);
  const worktree = findWorktree(repository, props.environment.worktreeId);
  const thread = findThread(worktree, props.environment.threadId);
  const title = threadTitle(thread, props.management);
  const pinned = props.management.pinnedThreadIds.includes(thread.id);
  const inspector = (
    <div className="mx-4 flex h-12 shrink-0 items-center gap-2 rounded-xl border border-white/[0.065] bg-white/[0.025] px-3">
      <GripVertical className="size-3.5 text-white/18" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-white/62">
        {title}
      </span>
      <span className="mr-1 text-[9px] text-white/20">thread controls</span>
      <IconButton
        label={`Rename ${title}`}
        onClick={() => props.onThreadAction('rename', thread, worktree)}
      >
        <Pencil className="size-3.5" />
      </IconButton>
      <IconButton
        label={`${pinned ? 'Unpin' : 'Pin'} ${title}`}
        onClick={() => props.onThreadAction('toggle-pin', thread, worktree)}
      >
        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </IconButton>
      <IconButton
        label={`Archive ${title}`}
        className="text-red-300/45 hover:text-red-300/80"
        onClick={() => props.onThreadAction('archive', thread, worktree)}
      >
        <Archive className="size-3.5" />
      </IconButton>
    </div>
  );
  return (
    <VariantShell
      {...props}
      variant="C"
      inspector={inspector}
      composer={
        <ComposerC
          draft={props.draft}
          onDraftChange={props.onDraftChange}
          repository={repository}
          threadTitle={title}
          worktree={worktree}
        />
      }
    />
  );
}

function PrototypeSwitcher({
  variant,
  environment,
  management,
  draft,
  onVariantChange,
}: {
  readonly variant: VariantKey;
  readonly environment: EnvironmentState;
  readonly management: ThreadManagementState;
  readonly draft: string;
  readonly onVariantChange: (variant: VariantKey) => void;
}): React.JSX.Element {
  const activeIndex = variants.findIndex((item) => item.key === variant);
  const activeVariant = requireItem(
    variants[activeIndex],
    'The prototype requires an active variant.',
  );
  const repository = findRepository(environment.repositoryId);
  const worktree = findWorktree(repository, environment.worktreeId);
  const thread = findThread(worktree, environment.threadId);

  const move = (offset: number): void => {
    const nextIndex =
      (activeIndex + offset + variants.length) % variants.length;
    const nextVariant = requireItem(
      variants[nextIndex],
      'The prototype requires a switcher variant.',
    );
    onVariantChange(nextVariant.key);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      <div className="max-w-[calc(100vw-2rem)] truncate rounded-full border border-white/[0.08] bg-black/70 px-3 py-1.5 text-[9px] text-white/38 shadow-xl backdrop-blur-xl">
        <span className="mr-2 text-amber-200/55">prototype state</span>
        {repository.label} · {worktree.branch} · {threadTitle(thread, management)}
        {' · '}
        pinned {management.pinnedThreadIds.length} · archived{' '}
        {management.archivedThreadIds.length} · draft {draft.length} ·{' '}
        {management.lastAction}
      </div>
      <div className="pointer-events-auto flex h-10 items-center rounded-xl border border-white/[0.14] bg-[#20201d]/95 p-1 shadow-[0_18px_50px_rgba(0,0,0,0.48)] backdrop-blur-xl">
        <IconButton label="Previous variant" onClick={() => move(-1)}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <Button
          className="h-8 min-w-[164px] gap-2 rounded-lg px-3 text-[11px] font-normal text-white/78 hover:bg-white/[0.04]"
          onClick={() => move(1)}
          type="button"
          variant="ghost"
        >
          <span className="text-white/30">{activeVariant.key}</span>
          {activeVariant.label}
        </Button>
        <IconButton label="Next variant" onClick={() => move(1)}>
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

/** Render the disposable thread-control and composer prototype. */
export function CleanEnvironmentPrototype(): React.JSX.Element {
  const [variant, setVariant] = useState<VariantKey>(readVariant);
  const [environment, setEnvironment] =
    useState<EnvironmentState>(initialEnvironment);
  const [management, setManagement] =
    useState<ThreadManagementState>(initialManagement);
  const [draft, setDraft] = useState('');

  const changeVariant = (nextVariant: VariantKey): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', nextVariant);
    window.history.replaceState(null, '', url);
    setVariant(nextVariant);
  };

  const performThreadAction = (
    action: ThreadAction,
    thread: ThreadItem,
    worktree: WorktreeItem,
  ): void => {
    setManagement((current) => {
      if (action === 'rename') {
        const titles = { ...current.titles };
        if (titles[thread.id] === undefined) {
          titles[thread.id] = `${thread.title} — refined`;
        } else {
          delete titles[thread.id];
        }
        return { ...current, titles, lastAction: `Renamed ${thread.title}` };
      }

      if (action === 'toggle-pin') {
        const pinned = current.pinnedThreadIds.includes(thread.id);
        return {
          ...current,
          pinnedThreadIds: pinned
            ? current.pinnedThreadIds.filter((id) => id !== thread.id)
            : [...current.pinnedThreadIds, thread.id],
          lastAction: `${pinned ? 'Unpinned' : 'Pinned'} ${thread.title}`,
        };
      }

      return {
        ...current,
        archivedThreadIds: [...current.archivedThreadIds, thread.id],
        pinnedThreadIds: current.pinnedThreadIds.filter(
          (id) => id !== thread.id,
        ),
        lastAction: `Archived ${thread.title}`,
      };
    });

    if (action === 'archive' && environment.threadId === thread.id) {
      const fallback = worktree.threads.find(
        (candidate) => candidate.id !== thread.id,
      );
      if (fallback !== undefined) {
        setEnvironment((current) => ({
          ...current,
          threadId: fallback.id,
        }));
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (shouldIgnoreShortcut(event.target)) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const activeIndex = variants.findIndex((item) => item.key === variant);
      const offset = event.key === 'ArrowLeft' ? -1 : 1;
      const nextIndex =
        (activeIndex + offset + variants.length) % variants.length;
      changeVariant(
        requireItem(variants[nextIndex], 'The prototype requires a variant.')
          .key,
      );
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [variant]);

  const props: PrototypeSurfaceProps = {
    environment,
    management,
    draft,
    onDraftChange: setDraft,
    onEnvironmentChange: setEnvironment,
    onThreadAction: performThreadAction,
  };

  return (
    <div className="h-full w-full overflow-hidden">
      {variant === 'B' ? (
        <VariantB {...props} />
      ) : variant === 'C' ? (
        <VariantC {...props} />
      ) : (
        <VariantA {...props} />
      )}
      <PrototypeSwitcher
        draft={draft}
        environment={environment}
        management={management}
        onVariantChange={changeVariant}
        variant={variant}
      />
    </div>
  );
}

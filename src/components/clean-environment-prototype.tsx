// Two independent experiments for input direction and global pin behavior, switchable through URL parameters.
import {
  Archive,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Folder,
  GitBranch,
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

type InputMode = 'quick' | 'workbench' | 'command';
type PinMode = 'shelf' | 'lift';
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
  readonly draft: string;
  readonly onDraftChange: (draft: string) => void;
}

interface ThreadLocation {
  readonly repository: RepositoryItem;
  readonly worktree: WorktreeItem;
  readonly thread: ThreadItem;
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

const inputModes: ReadonlyArray<{
  readonly key: InputMode;
  readonly label: string;
}> = [
  { key: 'quick', label: 'Quick' },
  { key: 'workbench', label: 'Workbench' },
  { key: 'command', label: 'Command' },
];

const pinModes: ReadonlyArray<{
  readonly key: PinMode;
  readonly label: string;
}> = [
  { key: 'shelf', label: 'Shelf' },
  { key: 'lift', label: 'Lift' },
];

const initialEnvironment: EnvironmentState = {
  repositoryId: 'ernie',
  worktreeId: 'ernie-main',
  threadId: 'environment',
};

const initialManagement: ThreadManagementState = {
  archivedThreadIds: [],
  pinnedThreadIds: ['thread-controls'],
  titles: {},
  lastAction: 'Pinned Thread controls for comparison',
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

function findThreadLocation(threadId: string): ThreadLocation | undefined {
  for (const repository of repositories) {
    for (const worktree of repository.worktrees) {
      const thread = worktree.threads.find((item) => item.id === threadId);
      if (thread !== undefined) return { repository, worktree, thread };
    }
  }
  return undefined;
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
  pinMode: PinMode,
): ReadonlyArray<ThreadItem> {
  return worktree.threads.filter(
    (thread) =>
      !management.archivedThreadIds.includes(thread.id) &&
      !(
        pinMode === 'lift' && management.pinnedThreadIds.includes(thread.id)
      ),
  );
}

function readInputMode(): InputMode {
  const value = new URLSearchParams(window.location.search).get('input');
  return value === 'workbench' || value === 'command' ? value : 'quick';
}

function readPinMode(): PinMode {
  return new URLSearchParams(window.location.search).get('pins') === 'lift'
    ? 'lift'
    : 'shelf';
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

function PinnedThreadRow({
  environment,
  location,
  management,
  onEnvironmentChange,
  onThreadAction,
}: Pick<
  PrototypeSurfaceProps,
  'environment' | 'management' | 'onEnvironmentChange' | 'onThreadAction'
> & {
  readonly location: ThreadLocation;
}): React.JSX.Element {
  const { repository, worktree, thread } = location;
  const title = threadTitle(thread, management);
  const selected = thread.id === environment.threadId;

  return (
    <ThreadContext
      pinned
      thread={thread}
      worktree={worktree}
      onThreadAction={onThreadAction}
    >
      <div className="group/thread flex min-h-10 items-center rounded-lg">
        <Button
          aria-current={selected ? 'page' : undefined}
          className={`h-10 min-w-0 flex-1 justify-start gap-2 rounded-lg px-2 text-left font-normal ${selected ? 'bg-white/[0.075] text-white/88' : 'text-white/46 hover:bg-white/[0.035] hover:text-white/70'}`}
          onClick={() =>
            onEnvironmentChange({
              repositoryId: repository.id,
              worktreeId: worktree.id,
              threadId: thread.id,
            })
          }
          type="button"
          variant="ghost"
        >
          <Pin className="size-3 shrink-0 text-amber-100/35" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px]">{title}</span>
            <span className="mt-0.5 block truncate text-[9px] text-white/22">
              {repository.label} / {worktree.branch}
            </span>
          </span>
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                aria-label={`Manage ${title}`}
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
            <ThreadClickActions
              pinned
              thread={thread}
              worktree={worktree}
              onThreadAction={onThreadAction}
            />
          </MenuContent>
        </Menu>
      </div>
    </ThreadContext>
  );
}

function PinnedThreads({
  environment,
  management,
  pinMode,
  onEnvironmentChange,
  onThreadAction,
}: Pick<
  PrototypeSurfaceProps,
  'environment' | 'management' | 'onEnvironmentChange' | 'onThreadAction'
> & {
  readonly pinMode: PinMode;
}): React.JSX.Element {
  const locations = management.pinnedThreadIds.flatMap((threadId) => {
    const location = findThreadLocation(threadId);
    return location === undefined || management.archivedThreadIds.includes(threadId)
      ? []
      : [location];
  });

  return (
    <section className="shrink-0 border-b border-white/[0.06] px-2 pb-2">
      <div className="flex h-10 items-center px-2">
        <p className="text-[10px] font-medium tracking-[0.08em] text-white/30 uppercase">
          Pinned
        </p>
        <span className="ml-auto rounded-md bg-white/[0.035] px-1.5 py-0.5 text-[8px] text-white/22">
          {pinMode === 'shelf' ? 'also in tree' : 'lifted from tree'}
        </span>
      </div>
      {locations.length === 0 ? (
        <p className="px-2 pb-2 text-[10px] leading-4 text-white/20">
          Pin any thread to reach it across repositories.
        </p>
      ) : (
        <div className="space-y-0.5">
          {locations.map((location) => (
            <PinnedThreadRow
              environment={environment}
              key={location.thread.id}
              location={location}
              management={management}
              onEnvironmentChange={onEnvironmentChange}
              onThreadAction={onThreadAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RepositoryTree({
  environment,
  management,
  pinMode,
  onEnvironmentChange,
  onThreadAction,
}: Pick<
  PrototypeSurfaceProps,
  'environment' | 'management' | 'onEnvironmentChange' | 'onThreadAction'
> & {
  readonly pinMode: PinMode;
}): React.JSX.Element {
  const activeRepository = findRepository(environment.repositoryId);
  const activeWorktree = findWorktree(
    activeRepository,
    environment.worktreeId,
  );

  return (
    <>
      <PinnedThreads
        environment={environment}
        management={management}
        pinMode={pinMode}
        onEnvironmentChange={onEnvironmentChange}
        onThreadAction={onThreadAction}
      />
      <div className="flex h-10 shrink-0 items-center justify-between px-3 pl-4">
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
                    const threads = visibleThreads(worktree, management, pinMode);
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
                              <ThreadRowA
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

function QuickComposer({
  repository,
  worktree,
  draft,
  onDraftChange,
}: ComposerProps): React.JSX.Element {
  return (
    <div className="w-full">
      <div className="flex min-h-14 items-end gap-1 rounded-2xl border border-white/[0.1] bg-[#1b1b18] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.25)] focus-within:border-white/[0.18]">
        <IconButton label="Add context" className="mb-0.5 shrink-0">
          <Plus className="size-4" />
        </IconButton>
        <textarea
          aria-label="Message Prime Agent"
          className="max-h-28 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-5 text-white/82 outline-none [field-sizing:content] placeholder:text-white/24"
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Ask Prime Agent…"
          rows={1}
          value={draft}
        />
        <SendButton draft={draft} />
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] text-white/20">
        <span>{repository.label}</span>
        <span>/</span>
        <span>{worktree.branch}</span>
        <span className="mx-1 text-white/10">·</span>
        <span>GPT-5.6 Sol</span>
      </div>
    </div>
  );
}

function WorkbenchComposer({
  repository,
  worktree,
  draft,
  onDraftChange,
}: ComposerProps): React.JSX.Element {
  return (
    <div className="w-full overflow-hidden rounded-[18px] border border-white/[0.1] bg-[#1b1b18] shadow-[0_24px_80px_rgba(0,0,0,0.28)] focus-within:border-white/[0.17]">
      <div className="flex h-9 items-center gap-1.5 border-b border-white/[0.055] px-3 text-[10px] text-white/32">
        <Folder className="size-3" />
        <span className="text-white/52">{repository.label}</span>
        <span className="text-white/12">/</span>
        <GitBranch className="size-3" />
        <span>{worktree.branch}</span>
        <span className="ml-auto max-w-[250px] truncate font-mono text-[9px] text-white/16">
          {worktree.path}
        </span>
      </div>
      <textarea
        aria-label="Message Prime Agent"
        className="block h-24 w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-6 text-white/82 outline-none placeholder:text-white/24"
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Describe the work, then tune its environment below…"
        value={draft}
      />
      <div className="flex h-11 items-center justify-between px-2.5 pb-1">
        <div className="flex items-center gap-0.5">
          <IconButton label="Add context">
            <Paperclip className="size-4" />
          </IconButton>
          <Button
            className="h-7 rounded-lg px-2 text-[10px] font-normal text-white/34 hover:bg-white/[0.05] hover:text-white/62"
            type="button"
            variant="ghost"
          >
            GPT-5.6 Sol
          </Button>
          <Button
            className="h-7 rounded-lg px-2 text-[10px] font-normal text-white/28 hover:bg-white/[0.05] hover:text-white/58"
            type="button"
            variant="ghost"
          >
            Depth 2
          </Button>
          <Button
            className="h-7 rounded-lg px-2 text-[10px] font-normal text-white/28 hover:bg-white/[0.05] hover:text-white/58"
            type="button"
            variant="ghost"
          >
            This Mac
          </Button>
        </div>
        <Button
          className="mr-1 h-7 rounded-lg px-2 text-[9px] font-normal text-white/20 hover:bg-white/[0.05]"
          type="button"
          variant="ghost"
        >
          / skills
        </Button>
        <SendButton draft={draft} />
      </div>
    </div>
  );
}

function CommandComposer({
  repository,
  worktree,
  draft,
  onDraftChange,
}: ComposerProps): React.JSX.Element {
  const activeTokenStart =
    Math.max(draft.lastIndexOf(' '), draft.lastIndexOf('\n')) + 1;
  const activeToken = draft.slice(activeTokenStart);

  const insertToken = (token: string): void => {
    if (activeToken.startsWith('@') || activeToken.startsWith('/')) {
      onDraftChange(`${draft.slice(0, activeTokenStart)}${token} `);
      return;
    }
    const separator = draft.length === 0 || draft.endsWith(' ') ? '' : ' ';
    onDraftChange(`${draft}${separator}${token} `);
  };

  const suggestions = activeToken.startsWith('@')
    ? ['@browser', '@repository', '@selection']
    : activeToken.startsWith('/')
      ? ['/prototype', '/audit', '/tdd']
      : [];

  return (
    <div className="w-full">
      {suggestions.length > 0 && (
        <div className="mb-1.5 flex items-center gap-1 rounded-xl border border-white/[0.07] bg-[#171715] p-1.5 shadow-lg">
          <span className="px-2 text-[9px] text-white/22">insert</span>
          {suggestions.map((suggestion) => (
            <Button
              className="h-7 rounded-lg bg-white/[0.035] px-2 text-[10px] font-normal text-white/44 hover:bg-white/[0.07] hover:text-white/70"
              key={suggestion}
              onClick={() => insertToken(suggestion)}
              type="button"
              variant="ghost"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      )}
      <div className="w-full rounded-[16px] border border-white/[0.1] bg-[#181816] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.3)] focus-within:border-white/[0.18]">
        <div className="flex items-center gap-1.5 px-1 pb-2">
          <Button
            className="h-7 rounded-lg bg-white/[0.045] px-2 text-[10px] font-normal text-white/45 hover:bg-white/[0.075]"
            onClick={() => insertToken('@browser')}
            type="button"
            variant="ghost"
          >
            @ context
          </Button>
          <Button
            className="h-7 rounded-lg bg-white/[0.045] px-2 text-[10px] font-normal text-white/45 hover:bg-white/[0.075]"
            onClick={() => insertToken('/prototype')}
            type="button"
            variant="ghost"
          >
            / skills
          </Button>
          <span className="ml-auto flex items-center gap-1 text-[9px] text-white/20">
            {repository.label} / {worktree.branch}
          </span>
        </div>
        <textarea
          aria-label="Message Prime Agent"
          className="block h-20 w-full resize-none rounded-xl bg-white/[0.025] px-3 py-2.5 text-[14px] leading-6 text-white/82 outline-none placeholder:text-white/24"
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Type @ for context or / for a skill…"
          value={draft}
        />
        <div className="flex h-10 items-end justify-between px-1">
          <span className="pb-2 text-[9px] text-white/18">
            commands become part of the prompt
          </span>
          <SendButton draft={draft} />
        </div>
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

function EnvironmentPrototypeSurface({
  inputMode,
  pinMode,
  environment,
  management,
  draft,
  onDraftChange,
  onEnvironmentChange,
  onThreadAction,
}: PrototypeSurfaceProps & {
  readonly inputMode: InputMode;
  readonly pinMode: PinMode;
}): React.JSX.Element {
  const repository = findRepository(environment.repositoryId);
  const worktree = findWorktree(repository, environment.worktreeId);
  const thread = findThread(worktree, environment.threadId);
  const title = threadTitle(thread, management);
  const composerProps: ComposerProps = {
    draft,
    onDraftChange,
    repository,
    worktree,
  };
  const composer =
    inputMode === 'workbench' ? (
      <WorkbenchComposer {...composerProps} />
    ) : inputMode === 'command' ? (
      <CommandComposer {...composerProps} />
    ) : (
      <QuickComposer {...composerProps} />
    );

  return (
    <AppChrome
      sidebar={
        <RepositoryTree
          environment={environment}
          management={management}
          pinMode={pinMode}
          onEnvironmentChange={onEnvironmentChange}
          onThreadAction={onThreadAction}
        />
      }
    >
      <section className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col px-8 pb-28">
        <div className="flex flex-1 items-end justify-center pb-8">
          <WorkspaceIntro threadTitle={title} />
        </div>
        <div className="pb-6">{composer}</div>
      </section>
    </AppChrome>
  );
}

function PrototypeSwitcher({
  inputMode,
  pinMode,
  environment,
  management,
  draft,
  onInputModeChange,
  onPinModeChange,
}: {
  readonly inputMode: InputMode;
  readonly pinMode: PinMode;
  readonly environment: EnvironmentState;
  readonly management: ThreadManagementState;
  readonly draft: string;
  readonly onInputModeChange: (inputMode: InputMode) => void;
  readonly onPinModeChange: (pinMode: PinMode) => void;
}): React.JSX.Element {
  const activeInputIndex = inputModes.findIndex(
    (item) => item.key === inputMode,
  );
  const repository = findRepository(environment.repositoryId);
  const worktree = findWorktree(repository, environment.worktreeId);
  const thread = findThread(worktree, environment.threadId);

  const moveInput = (offset: number): void => {
    const nextIndex =
      (activeInputIndex + offset + inputModes.length) % inputModes.length;
    const nextInput = requireItem(
      inputModes[nextIndex],
      'The prototype requires an input mode.',
    );
    onInputModeChange(nextInput.key);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      <div className="max-w-[calc(100vw-2rem)] truncate rounded-full border border-white/[0.08] bg-black/70 px-3 py-1.5 text-[9px] text-white/38 shadow-xl backdrop-blur-xl">
        <span className="mr-2 text-amber-200/55">prototype state</span>
        {repository.label} · {worktree.branch} · {threadTitle(thread, management)}
        {' · '}
        input {inputMode} · pins {pinMode} · pinned [
        {management.pinnedThreadIds.join(', ') || 'none'}] · archived{' '}
        {management.archivedThreadIds.length} · draft {draft.length} ·{' '}
        {management.lastAction}
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/[0.14] bg-[#20201d]/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.48)] backdrop-blur-xl">
        <span className="pl-2 text-[9px] font-medium tracking-[0.08em] text-white/24 uppercase">
          input
        </span>
        <IconButton label="Previous input" onClick={() => moveInput(-1)}>
          <ChevronLeft className="size-3.5" />
        </IconButton>
        <div className="flex rounded-xl bg-black/20 p-0.5">
          {inputModes.map((mode) => (
            <Button
              aria-pressed={mode.key === inputMode}
              className={`h-7 rounded-[9px] px-2.5 text-[10px] font-normal ${mode.key === inputMode ? 'bg-white/[0.1] text-white/78 shadow-sm' : 'text-white/30 hover:bg-white/[0.045] hover:text-white/58'}`}
              key={mode.key}
              onClick={() => onInputModeChange(mode.key)}
              type="button"
              variant="ghost"
            >
              {mode.label}
            </Button>
          ))}
        </div>
        <IconButton label="Next input" onClick={() => moveInput(1)}>
          <ChevronRight className="size-3.5" />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-white/[0.08]" />
        <span className="text-[9px] font-medium tracking-[0.08em] text-white/24 uppercase">
          pins
        </span>
        <div className="flex rounded-xl bg-black/20 p-0.5">
          {pinModes.map((mode) => (
            <Button
              aria-pressed={mode.key === pinMode}
              className={`h-7 rounded-[9px] px-2.5 text-[10px] font-normal ${mode.key === pinMode ? 'bg-white/[0.1] text-white/78 shadow-sm' : 'text-white/30 hover:bg-white/[0.045] hover:text-white/58'}`}
              key={mode.key}
              onClick={() => onPinModeChange(mode.key)}
              type="button"
              variant="ghost"
            >
              {mode.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Render the disposable input and global-pinning prototype. */
export function CleanEnvironmentPrototype(): React.JSX.Element {
  const [inputMode, setInputMode] = useState<InputMode>(readInputMode);
  const [pinMode, setPinMode] = useState<PinMode>(readPinMode);
  const [environment, setEnvironment] =
    useState<EnvironmentState>(initialEnvironment);
  const [management, setManagement] =
    useState<ThreadManagementState>(initialManagement);
  const [draft, setDraft] = useState('');

  const changeInputMode = (nextInputMode: InputMode): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', 'A');
    url.searchParams.set('input', nextInputMode);
    window.history.replaceState(null, '', url);
    setInputMode(nextInputMode);
  };

  const changePinMode = (nextPinMode: PinMode): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', 'A');
    url.searchParams.set('pins', nextPinMode);
    window.history.replaceState(null, '', url);
    setPinMode(nextPinMode);
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
      const activeIndex = inputModes.findIndex(
        (item) => item.key === inputMode,
      );
      const offset = event.key === 'ArrowLeft' ? -1 : 1;
      const nextIndex =
        (activeIndex + offset + inputModes.length) % inputModes.length;
      changeInputMode(
        requireItem(inputModes[nextIndex], 'The prototype requires an input.')
          .key,
      );
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputMode]);

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
      <EnvironmentPrototypeSurface
        {...props}
        inputMode={inputMode}
        pinMode={pinMode}
      />
      <PrototypeSwitcher
        draft={draft}
        environment={environment}
        inputMode={inputMode}
        management={management}
        pinMode={pinMode}
        onInputModeChange={changeInputMode}
        onPinModeChange={changePinMode}
      />
    </div>
  );
}

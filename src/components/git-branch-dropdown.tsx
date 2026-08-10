import { Menu } from '@base-ui/react/menu';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { GitWorktreeDialog } from '@/components/git-worktree-dialog';

interface GitBranchDropdownProps {
  readonly branches: readonly string[];
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly statusId: string;
  readonly currentBranch: string | null;
  readonly changeBranch: (name: string) => void;
  readonly deleteBranch: (name: string) => void;
  readonly initializeGit: () => void;
  readonly createWorktree: (branchName: string) => void;
}

const popupClass =
  'relative z-50 min-w-48 overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden';
const itemClass =
  'relative flex min-h-9 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground';
const branchListClass =
  'max-h-52 overflow-y-auto overscroll-contain scroll-py-1 [scrollbar-gutter:stable]';

/** Switch branches, create worktrees, and manage safe branch actions. */
export function GitBranchDropdown({
  branches,
  disabled,
  loading,
  statusId,
  currentBranch,
  changeBranch,
  deleteBranch,
  initializeGit,
  createWorktree,
}: GitBranchDropdownProps): React.JSX.Element {
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const branchLabel =
    branches.length === 0 ? 'No Git' : (currentBranch ?? 'No branch');
  const deletableBranches = branches.filter(
    (name) =>
      name !== currentBranch && name !== 'main' && name !== 'staging',
  );

  function confirmDelete(name: string): void {
    if (window.confirm(`Delete local branch "${name}"?`)) deleteBranch(name);
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          ref={triggerRef}
          className="relative inline-flex h-8 min-w-[106px] max-w-[180px] items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-normal text-foreground outline-none transition-opacity select-none after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-pressed:bg-muted data-[loading=true]:opacity-50 disabled:pointer-events-none disabled:opacity-50"
          aria-label={`Git branch: ${branchLabel}${loading ? ', loading' : ''}`}
          aria-describedby={statusId}
          aria-busy={loading}
          data-loading={loading}
          disabled={disabled}
          title={branchLabel}
        >
          <GitBranchIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate text-left">
            {branchLabel}
          </span>
          {loading ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          ) : (
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          )}
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner
            className="isolate z-50 outline-hidden"
            sideOffset={4}
            align="start"
          >
            <Menu.Popup className={popupClass}>
              {branches.length === 0 ? (
                <Menu.Item className={itemClass} onClick={initializeGit}>
                  <GitBranchPlusIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  <span>Initialize Git with main</span>
                </Menu.Item>
              ) : (
                <>
                  <Menu.Group className={branchListClass}>
                    {branches.map((name) => (
                      <Menu.Item
                        key={name}
                        className={itemClass}
                        aria-current={name === currentBranch ? 'true' : undefined}
                        onClick={() => changeBranch(name)}
                      >
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                        {name === currentBranch ? (
                          <CheckIcon
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                        ) : null}
                      </Menu.Item>
                    ))}
                  </Menu.Group>

                  <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
                  <Menu.Item
                    className={itemClass}
                    onClick={() => setWorktreeDialogOpen(true)}
                  >
                    <FolderGit2Icon
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                    <span>New worktree…</span>
                  </Menu.Item>
                  <Menu.SubmenuRoot>
                    <Menu.SubmenuTrigger
                      className={`${itemClass} text-destructive data-highlighted:text-destructive`}
                      disabled={deletableBranches.length === 0}
                    >
                      <Trash2Icon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      <span className="flex-1">Delete branch</span>
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                    </Menu.SubmenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner
                        className="isolate z-50 outline-hidden"
                        sideOffset={4}
                        alignOffset={-4}
                      >
                        <Menu.Popup className={popupClass}>
                          <Menu.Group className={branchListClass}>
                            {deletableBranches.map((name) => (
                              <Menu.Item
                                key={name}
                                className={`${itemClass} text-destructive data-highlighted:text-destructive`}
                                onClick={() => confirmDelete(name)}
                              >
                                <Trash2Icon
                                  aria-hidden="true"
                                  className="size-4 shrink-0"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {name}
                                </span>
                              </Menu.Item>
                            ))}
                          </Menu.Group>
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.SubmenuRoot>
                </>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      <GitWorktreeDialog
        open={worktreeDialogOpen}
        busy={loading}
        finalFocusRef={triggerRef}
        onOpenChange={setWorktreeDialogOpen}
        createWorktree={createWorktree}
      />
    </>
  );
}

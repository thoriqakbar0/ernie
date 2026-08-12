import {
  ChevronDownIcon,
  FolderGit2Icon,
  GitBranchIcon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { GitWorktreeDialog } from '@/components/git-worktree-dialog';
import { Button } from '@/components/trovecn/ui/button';
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from '@/components/trovecn/ui/menu';

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
      <Menu>
        <MenuTrigger
          ref={triggerRef}
          render={
            <Button
              type="button"
              variant="outline"
              className="relative min-w-[106px] max-w-[180px] justify-start bg-card px-3 font-normal after:absolute after:inset-x-0 after:-inset-y-1 data-[loading=true]:opacity-50"
            />
          }
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
        </MenuTrigger>

        <MenuContent align="start" sideOffset={4} className="min-w-48">
          {branches.length === 0 ? (
            <MenuItem className="min-h-9" onClick={initializeGit}>
              <GitBranchPlusIcon aria-hidden="true" />
              <span>Initialize Git with main</span>
            </MenuItem>
          ) : (
            <>
              <MenuRadioGroup
                value={currentBranch ?? ''}
                onValueChange={changeBranch}
                className={branchListClass}
              >
                {branches.map((name) => (
                  <MenuRadioItem
                    key={name}
                    value={name}
                    indicator="check"
                    className="min-h-9 data-checked:bg-active data-checked:text-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>

              <MenuSeparator />
              <MenuItem
                className="min-h-9"
                onClick={() => setWorktreeDialogOpen(true)}
              >
                <FolderGit2Icon aria-hidden="true" />
                <span>New worktree…</span>
              </MenuItem>
              <MenuSub>
                <MenuSubTrigger
                  className="min-h-9 text-destructive data-highlighted:text-destructive"
                  disabled={deletableBranches.length === 0}
                >
                  <Trash2Icon aria-hidden="true" />
                  <span className="flex-1">Delete branch</span>
                </MenuSubTrigger>
                <MenuSubContent className="min-w-48">
                  <MenuGroup className={branchListClass}>
                    {deletableBranches.map((name) => (
                      <MenuItem
                        key={name}
                        variant="destructive"
                        className="min-h-9"
                        onClick={() => confirmDelete(name)}
                      >
                        <Trash2Icon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">
                          {name}
                        </span>
                      </MenuItem>
                    ))}
                  </MenuGroup>
                </MenuSubContent>
              </MenuSub>
            </>
          )}
        </MenuContent>
      </Menu>

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

import { Menu } from '@base-ui/react/menu';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitBranchIcon,
  GitBranchPlusIcon,
  PencilLineIcon,
  Trash2Icon,
} from 'lucide-react';

interface GitBranchDropdownProps {
  readonly branches: readonly string[];
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly currentBranch: string | null;
  readonly changeBranch: (name: string) => void;
  readonly deleteBranch: (name: string) => void;
  readonly renameBranch: (currentName: string, newName: string) => void;
  readonly initializeGit: () => void;
}

const popupClass =
  'relative z-50 min-w-40 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0';
const itemClass =
  'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground';
const branchListClass =
  'max-h-56 overflow-y-auto overscroll-contain scroll-py-1';

/** Switch, rename, and safely delete local Git branches. */
export function GitBranchDropdown({
  branches,
  disabled,
  loading,
  currentBranch,
  changeBranch,
  deleteBranch,
  renameBranch,
  initializeGit,
}: GitBranchDropdownProps): React.JSX.Element {
  const branchLabel =
    branches.length === 0 ? 'No Git' : (currentBranch ?? 'No branch');
  const renameableBranches = branches.filter(
    (name) => name !== 'main' && name !== 'staging',
  );
  const deletableBranches = branches.filter(
    (name) =>
      name !== currentBranch && name !== 'main' && name !== 'staging',
  );

  function confirmDelete(name: string): void {
    if (window.confirm(`Delete local branch "${name}"?`)) deleteBranch(name);
  }

  function requestRename(name: string): void {
    const newName = window.prompt('Rename local branch:', name)?.trim();
    if (newName !== undefined && newName.length > 0 && newName !== name) {
      renameBranch(name, newName);
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className="relative inline-flex h-8 min-w-[106px] max-w-[180px] items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-normal text-foreground outline-none transition-opacity select-none after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-pressed:bg-muted data-[loading=true]:opacity-50 disabled:pointer-events-none disabled:opacity-50"
        aria-label={`Git branch: ${branchLabel}`}
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
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
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
                <GitBranchPlusIcon className="size-4 shrink-0" />
                <span>Initialize Git with main</span>
              </Menu.Item>
            ) : (
              <>
                <Menu.Group className={branchListClass}>
                  {branches.map((name) => (
                    <Menu.Item
                      key={name}
                      className={itemClass}
                      onClick={() => changeBranch(name)}
                    >
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      {name === currentBranch ? (
                        <CheckIcon className="size-4 shrink-0" />
                      ) : null}
                    </Menu.Item>
                  ))}
                </Menu.Group>

                <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger
                    className={itemClass}
                    disabled={renameableBranches.length === 0}
                  >
                    <PencilLineIcon className="size-4 shrink-0" />
                    <span className="flex-1">Rename branch</span>
                    <ChevronRightIcon className="size-4 shrink-0" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner
                      className="isolate z-50 outline-hidden"
                      sideOffset={4}
                      alignOffset={-4}
                    >
                      <Menu.Popup className={popupClass}>
                        <Menu.Group className={branchListClass}>
                          {renameableBranches.map((name) => (
                            <Menu.Item
                              key={name}
                              className={itemClass}
                              onClick={() => requestRename(name)}
                            >
                              <PencilLineIcon className="size-4 shrink-0" />
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
                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger
                    className={`${itemClass} text-destructive data-highlighted:text-destructive`}
                    disabled={deletableBranches.length === 0}
                  >
                    <Trash2Icon className="size-4 shrink-0" />
                    <span className="flex-1">Delete branch</span>
                    <ChevronRightIcon className="size-4 shrink-0" />
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
                              <Trash2Icon className="size-4 shrink-0" />
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
  );
}

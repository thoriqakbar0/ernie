import { Menu } from '@base-ui/react/menu';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitBranchIcon,
  Trash2Icon,
} from 'lucide-react';

interface GitBranchDropdownProps {
  readonly branches: readonly string[];
  readonly busy: boolean;
  readonly currentBranch: string | null;
  readonly changeBranch: (name: string) => void;
  readonly deleteBranch: (name: string) => void;
}

const popupClass =
  'relative z-50 min-w-40 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0';
const itemClass =
  'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground';

/** Select, inspect, and safely delete local Git branches. */
export function GitBranchDropdown({
  branches,
  busy,
  currentBranch,
  changeBranch,
  deleteBranch,
}: GitBranchDropdownProps): React.JSX.Element {
  const deletableBranches = branches.filter(
    (name) =>
      name !== currentBranch && name !== 'main' && name !== 'staging',
  );

  function confirmDelete(name: string): void {
    if (window.confirm(`Delete local branch "${name}"?`)) deleteBranch(name);
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex h-[30px] w-[106px] items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm text-muted-foreground outline-none select-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-pressed:bg-muted disabled:pointer-events-none disabled:opacity-50"
        aria-label="Git branch"
        disabled={busy || branches.length === 0}
      >
        <GitBranchIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {currentBranch ?? 'No branch'}
        </span>
        <ChevronDownIcon className="size-4 shrink-0" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner
          className="isolate z-50 outline-hidden"
          sideOffset={4}
          align="start"
        >
          <Menu.Popup className={popupClass}>
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

            <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
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
                    {deletableBranches.map((name) => (
                      <Menu.Item
                        key={name}
                        className={`${itemClass} text-destructive data-highlighted:text-destructive`}
                        onClick={() => confirmDelete(name)}
                      >
                        <Trash2Icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{name}</span>
                      </Menu.Item>
                    ))}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

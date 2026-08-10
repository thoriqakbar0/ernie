import { Combobox } from '@base-ui/react/combobox';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderPlusIcon,
  LaptopIcon,
  SearchIcon,
} from 'lucide-react';
import { useState } from 'react';

import { GitBranchDropdown } from '@/components/git-branch-dropdown';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import type {
  PrimeAgentFolderChoice,
  PrimeAgentWorkspaceController,
} from '@/hooks/use-prime-agent-workspace';

type CurrentWorkspaceProps = Pick<
  PrimeAgentWorkspaceController,
  | 'busy'
  | 'gitBranch'
  | 'gitBranchBusy'
  | 'gitBranches'
  | 'loadingWorkspace'
  | 'selectedCwd'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'changeGitBranch'
  | 'deleteGitBranch'
  | 'renameGitBranch'
  | 'initializeGitRepository'
> & {
  readonly folders: readonly PrimeAgentFolderChoice[];
};

/** Workspace context shown above Ernie's primary task input. */
export function CurrentWorkspace({
  busy,
  folders,
  gitBranch,
  gitBranchBusy,
  gitBranches,
  loadingWorkspace,
  selectedCwd,
  changeFolder,
  chooseWorkspaceDirectory,
  changeGitBranch,
  deleteGitBranch,
  renameGitBranch,
  initializeGitRepository,
}: CurrentWorkspaceProps): React.JSX.Element {
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const selectedFolder =
    folders.find((folder) => folder.value === selectedCwd) ?? null;

  return (
    <section
      className="flex min-h-9 flex-wrap items-center gap-3"
      aria-label="Task environment"
    >
      <Field className="w-auto min-w-0">
        <FieldLabel htmlFor="workspace-folder" className="sr-only">
          Folder location
        </FieldLabel>
        <Combobox.Root
          items={folders}
          value={selectedFolder}
          open={folderPickerOpen}
          onOpenChange={setFolderPickerOpen}
          onValueChange={(folder) => changeFolder(folder?.value ?? null)}
          isItemEqualToValue={(folder, value) => folder.value === value.value}
        >
          <Combobox.Trigger
            id="workspace-folder"
            className="flex h-8 max-w-48 items-center justify-between gap-1.5 rounded-lg border border-input bg-card px-3 text-sm whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loadingWorkspace}
          >
            <span className="min-w-0 truncate">
              <Combobox.Value placeholder="Workspace" />
            </span>
            <Combobox.Icon>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </Combobox.Icon>
          </Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Positioner
              align="start"
              sideOffset={4}
              className="isolate z-50 outline-none"
            >
              <Combobox.Popup
                aria-label="Choose workspace directory"
                className="relative isolate z-50 w-72 max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              >
                <div className="relative border-b border-border p-2">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Combobox.Input
                    aria-label="Search workspace directories"
                    placeholder="Search directories"
                    className="h-8 w-full rounded-md bg-muted/60 pr-2 pl-8 text-sm outline-none select-text placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No directories found.
                </Combobox.Empty>
                <Combobox.List className="max-h-56 overflow-y-auto overscroll-contain p-1 scroll-py-1 outline-none data-empty:p-0">
                  {(folder: PrimeAgentFolderChoice, index: number) => (
                    <Combobox.Item
                      key={folder.value}
                      value={folder}
                      index={index}
                      className="relative flex cursor-default items-center gap-2 rounded-md py-2 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{folder.label}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {folder.value}
                        </div>
                      </div>
                      <Combobox.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
                        <CheckIcon className="size-4" />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  )}
                </Combobox.List>
                <Combobox.Separator className="h-px bg-border" />
                <button
                  type="button"
                  aria-label="New directory"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                  onClick={() => {
                    setFolderPickerOpen(false);
                    chooseWorkspaceDirectory();
                  }}
                >
                  <FolderPlusIcon className="size-4 text-muted-foreground" />
                  New directory…
                </button>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      </Field>

      <GitBranchDropdown
        branches={gitBranches}
        currentBranch={gitBranch}
        disabled={busy || loadingWorkspace || selectedCwd === null}
        loading={gitBranchBusy}
        statusId="workspace-status"
        changeBranch={changeGitBranch}
        deleteBranch={deleteGitBranch}
        renameBranch={renameGitBranch}
        initializeGit={initializeGitRepository}
      />

      <Button
        variant="outline"
        className="bg-card px-3 text-sm font-normal text-muted-foreground"
      >
        <LaptopIcon />
        This Mac
      </Button>
    </section>
  );
}

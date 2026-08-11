import { Combobox } from '@base-ui/react/combobox';
import {
  CheckIcon,
  ChevronDownIcon,
  CloudIcon,
  FolderPlusIcon,
  LaptopIcon,
  LoaderCircleIcon,
  PlayIcon,
  SearchIcon,
} from 'lucide-react';
import { useState } from 'react';

import { GitBranchDropdown } from '@/components/git-branch-dropdown';
import { RlmDepthPicker } from '@/components/rlm-depth-picker';
import { Button } from '@/components/trovecn/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import type {
  PrimeAgentFolderChoice,
  PrimeAgentWorkspaceController,
} from '@/hooks/use-prime-agent-workspace';

type CurrentWorkspaceProps = Pick<
  PrimeAgentWorkspaceController,
  | 'busy'
  | 'creatingAgent'
  | 'gitBranch'
  | 'gitBranchBusy'
  | 'gitBranches'
  | 'gitWorktreeError'
  | 'loadingWorkspace'
  | 'rlmMaxDepth'
  | 'rlmMaxDepthBusy'
  | 'selectedCwd'
  | 'selectedSessionId'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'changeGitBranch'
  | 'changeRlmMaxDepth'
  | 'deleteGitBranch'
  | 'initializeGitRepository'
  | 'createGitWorktree'
  | 'createAgentSession'
> & {
  readonly folders: readonly PrimeAgentFolderChoice[];
};

const executionTargets = [
  { label: 'This Mac', value: 'local' },
  { label: 'Cloud', value: 'cloud' },
];

/** Workspace context shown above Ernie's primary task input. */
export function CurrentWorkspace({
  busy,
  creatingAgent,
  folders,
  gitBranch,
  gitBranchBusy,
  gitBranches,
  gitWorktreeError,
  loadingWorkspace,
  rlmMaxDepth,
  rlmMaxDepthBusy,
  selectedCwd,
  selectedSessionId,
  changeFolder,
  chooseWorkspaceDirectory,
  changeGitBranch,
  changeRlmMaxDepth,
  deleteGitBranch,
  initializeGitRepository,
  createGitWorktree,
  createAgentSession,
}: CurrentWorkspaceProps): React.JSX.Element {
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const selectedFolder =
    folders.find((folder) => folder.value === selectedCwd) ?? null;

  return (
    <section
      className="flex min-h-9 flex-wrap items-center gap-2"
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
                className="relative isolate z-50 w-72 max-w-(--available-width) overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"
              >
                <div className="relative border-b border-border p-2">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Combobox.Input
                    aria-label="Search workspace directories"
                    placeholder="Search directories"
                    spellCheck={false}
                    className="h-8 w-full rounded-md bg-muted/60 pr-2 pl-8 text-sm outline-none select-text placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
                <Combobox.Empty className="text-center text-sm text-muted-foreground [&:not(:empty)]:px-3 [&:not(:empty)]:py-6">
                  No directories found.
                </Combobox.Empty>
                <Combobox.List className="max-h-52 overflow-y-auto overscroll-contain p-1 scroll-py-1 outline-none [scrollbar-gutter:stable] data-empty:p-0">
                  {(folder: PrimeAgentFolderChoice, index: number) => (
                    <Combobox.Item
                      key={folder.value}
                      value={folder}
                      index={index}
                      className="relative flex min-h-11 cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{folder.label}</div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={folder.value}
                        >
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
                  className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-accent/80 motion-reduce:transition-none"
                  onClick={() => {
                    setFolderPickerOpen(false);
                    chooseWorkspaceDirectory();
                  }}
                >
                  <FolderPlusIcon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
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
        initializeGit={initializeGitRepository}
        createWorktree={createGitWorktree}
      />

      <Select items={executionTargets} value="local">
        <SelectTrigger
          aria-label="Execution location"
          className="bg-card px-3 text-sm font-normal text-muted-foreground"
        >
          <LaptopIcon aria-hidden="true" />
          <span>This Mac</span>
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          sideOffset={6}
          className="w-44"
        >
          <SelectGroup>
            <SelectItem value="local">
              <LaptopIcon aria-hidden="true" />
              This Mac
            </SelectItem>
            <SelectItem
              value="cloud"
              disabled
              aria-label="Cloud, coming soon"
            >
              <CloudIcon aria-hidden="true" />
              <span className="flex flex-1 items-center justify-between gap-3">
                Cloud
                <span className="text-xs text-muted-foreground">Soon</span>
              </span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>

      <RlmDepthPicker
        busy={rlmMaxDepthBusy}
        depth={rlmMaxDepth}
        onDepthChange={changeRlmMaxDepth}
      />

      {selectedSessionId === null ? (
        <Button
          type="button"
          variant="outline"
          disabled={creatingAgent || loadingWorkspace || selectedCwd === null}
          aria-label="Start Agent"
          onClick={() => {
            if (selectedCwd !== null) createAgentSession(selectedCwd);
          }}
        >
          {creatingAgent ? (
            <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" />
          ) : (
            <PlayIcon aria-hidden="true" />
          )}
          {creatingAgent ? 'Starting…' : 'Start Agent'}
        </Button>
      ) : null}

      {gitWorktreeError === null ? null : (
        <p
          className="basis-full text-xs text-destructive"
          role="alert"
          aria-atomic="true"
        >
          {gitWorktreeError}
        </p>
      )}
    </section>
  );
}

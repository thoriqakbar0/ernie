import {
  CloudIcon,
  FolderPlusIcon,
  LaptopIcon,
} from 'lucide-react';
import { useState } from 'react';

import { GitBranchDropdown } from '@/components/git-branch-dropdown';
import { RlmDepthPicker } from '@/components/rlm-depth-picker';
import { Button } from '@/components/trovecn/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxIcon,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxSearchIcon,
  ComboboxTrigger,
} from '@/components/trovecn/ui/combobox';
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
  | 'gitBranch'
  | 'gitBranchBusy'
  | 'gitBranches'
  | 'gitWorktreeError'
  | 'loadingWorkspace'
  | 'rlmMaxDepth'
  | 'rlmMaxDepthBusy'
  | 'selectedCwd'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'changeGitBranch'
  | 'changeRlmMaxDepth'
  | 'deleteGitBranch'
  | 'initializeGitRepository'
  | 'createGitWorktree'
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
  folders,
  gitBranch,
  gitBranchBusy,
  gitBranches,
  gitWorktreeError,
  loadingWorkspace,
  rlmMaxDepth,
  rlmMaxDepthBusy,
  selectedCwd,
  changeFolder,
  chooseWorkspaceDirectory,
  changeGitBranch,
  changeRlmMaxDepth,
  deleteGitBranch,
  initializeGitRepository,
  createGitWorktree,
}: CurrentWorkspaceProps): React.JSX.Element {
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const selectedFolder =
    folders.find((folder) => folder.value === selectedCwd) ?? null;

  return (
    <section
      className="flex min-h-9 flex-wrap items-center gap-2"
      aria-label="New Agent settings"
    >
      <Field className="w-auto min-w-0">
        <FieldLabel htmlFor="workspace-folder" className="sr-only">
          Folder location
        </FieldLabel>
        <Combobox
          items={folders}
          value={selectedFolder}
          open={folderPickerOpen}
          onOpenChange={setFolderPickerOpen}
          onValueChange={(folder) => changeFolder(folder?.value ?? null)}
          isItemEqualToValue={(folder, value) => folder.value === value.value}
        >
          <ComboboxTrigger
            id="workspace-folder"
            render={
              <Button
                type="button"
                variant="outline"
                className="max-w-48 justify-between bg-card px-3 font-normal"
              />
            }
            disabled={loadingWorkspace}
          >
            <span className="min-w-0 truncate">
              {selectedFolder?.label ?? 'Workspace'}
            </span>
            <ComboboxIcon />
          </ComboboxTrigger>
          <ComboboxContent
            aria-label="Choose workspace directory"
            className="w-72 max-w-(--available-width)"
            sideOffset={4}
          >
            <div className="p-1">
              <ComboboxInputGroup className="bg-muted/60">
                <ComboboxSearchIcon />
                <ComboboxInput
                  aria-label="Search workspace directories"
                  placeholder="Search directories"
                  spellCheck={false}
                />
              </ComboboxInputGroup>
            </div>
            <ComboboxEmpty>No directories found.</ComboboxEmpty>
            <ComboboxList className="max-h-52 overflow-y-auto overscroll-contain scroll-py-1 [scrollbar-gutter:stable]">
              {(folder: PrimeAgentFolderChoice, index: number) => (
                <ComboboxItem
                  key={folder.value}
                  value={folder}
                  index={index}
                  className="min-h-11"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">
                      {folder.label}
                    </div>
                    <div
                      className="truncate text-xs text-muted-foreground"
                      title={folder.value}
                    >
                      {folder.value}
                    </div>
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
            <div aria-hidden="true" className="-mx-1 my-1 h-px bg-border" />
            <Button
              type="button"
              variant="ghost"
              aria-label="New directory"
              className="w-full justify-start px-2 font-normal text-muted-foreground"
              onClick={() => {
                setFolderPickerOpen(false);
                chooseWorkspaceDirectory();
              }}
            >
              <FolderPlusIcon aria-hidden="true" />
              New directory…
            </Button>
          </ComboboxContent>
        </Combobox>
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

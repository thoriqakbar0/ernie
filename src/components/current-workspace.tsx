import {
  CloudIcon,
  FolderPlusIcon,
  LaptopIcon,
} from 'lucide-react';
import { useState } from 'react';

import { GitBranchDropdown } from '@/components/git-branch-dropdown';
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
import { Separator } from '@/components/ui/separator';
import type {
  AgentWorkspaceFolder,
  AgentWorkspaceController,
} from '@/packages/agent-workspace';

type CurrentWorkspaceProps = Pick<
  AgentWorkspaceController,
  | 'busy'
  | 'gitBranch'
  | 'gitBranchBusy'
  | 'gitBranches'
  | 'gitWorktreeError'
  | 'loadingWorkspace'
  | 'selectedCwd'
  | 'changeFolder'
  | 'chooseWorkspaceDirectory'
  | 'changeGitBranch'
  | 'deleteGitBranch'
  | 'initializeGitRepository'
  | 'createGitWorktree'
> & {
  readonly disabled?: boolean;
  readonly folders: readonly AgentWorkspaceFolder[];
};

const executionTargets = [
  { label: 'This Mac', value: 'local' },
  { label: 'Cloud', value: 'cloud' },
];

function compactParentPath(path: string): string {
  const lastSeparator = path.lastIndexOf('/');
  const parentPath = lastSeparator <= 0 ? '/' : path.slice(0, lastSeparator);
  const macHomePath = /^\/Users\/[^/]+(?=\/|$)/u.exec(parentPath)?.[0];

  return macHomePath === undefined
    ? parentPath
    : `~${parentPath.slice(macHomePath.length)}`;
}

/** Workspace context shown above Ernie's primary task input. */
export function CurrentWorkspace({
  busy,
  disabled = false,
  folders,
  gitBranch,
  gitBranchBusy,
  gitBranches,
  gitWorktreeError,
  loadingWorkspace,
  selectedCwd,
  changeFolder,
  chooseWorkspaceDirectory,
  changeGitBranch,
  deleteGitBranch,
  initializeGitRepository,
  createGitWorktree,
}: CurrentWorkspaceProps): React.JSX.Element {
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const selectedExecutionFolder =
    folders.find((folder) => folder.value === selectedCwd) ?? null;
  const selectedFolder =
    folders.find(
      (folder) =>
        folder.value === selectedExecutionFolder?.repositoryCwd,
    ) ?? selectedExecutionFolder;

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
          itemToStringLabel={(folder) => `${folder.label} ${folder.value}`}
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
            disabled={disabled || loadingWorkspace}
          >
            <span className="min-w-0 truncate">
              {selectedFolder?.label ?? 'Workspace'}
            </span>
            <ComboboxIcon />
          </ComboboxTrigger>
          <ComboboxContent
            aria-label="Choose workspace directory"
            className="w-64 max-w-(--available-width) rounded-xl p-1.5"
            sideOffset={6}
          >
            <div className="pb-1">
              <ComboboxInputGroup className="h-8 border-transparent bg-muted/40 focus-within:border-transparent focus-within:ring-0 dark:bg-muted/30">
                <ComboboxSearchIcon className="[&_svg]:size-3.5" />
                <ComboboxInput
                  aria-label="Search workspaces"
                  className="text-sm"
                  placeholder="Search workspaces…"
                  spellCheck={false}
                />
              </ComboboxInputGroup>
            </div>
            <ComboboxEmpty>No matching workspaces.</ComboboxEmpty>
            <ComboboxList className="max-h-52 overflow-y-auto overscroll-contain scroll-py-1 [scrollbar-gutter:stable]">
              {(folder: AgentWorkspaceFolder, index: number) => {
                const parentPath = compactParentPath(folder.value);

                return (
                  <ComboboxItem
                    key={folder.value}
                    value={folder}
                    index={index}
                    className="h-9 min-h-0 py-0 pr-7 text-sm data-[selected]:bg-muted/60"
                    title={folder.value}
                  >
                    <span className="max-w-28 shrink-0 truncate text-foreground">
                      {folder.label}
                    </span>
                    <span
                      className="ml-auto min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground/65"
                      aria-label={`Parent directory ${parentPath}`}
                    >
                      {parentPath}
                    </span>
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
            <Separator className="-mx-1 my-1 w-auto" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-workspace-directory-action=""
              className="h-9 w-full justify-start px-2 text-sm font-normal text-foreground"
              onClick={() => {
                setFolderPickerOpen(false);
                chooseWorkspaceDirectory();
              }}
            >
              <FolderPlusIcon aria-hidden="true" />
              Choose another folder…
            </Button>
          </ComboboxContent>
        </Combobox>
      </Field>

      <GitBranchDropdown
        branches={gitBranches}
        currentBranch={gitBranch}
        disabled={disabled || busy || loadingWorkspace || selectedCwd === null}
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
          disabled={disabled}
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

import { LaptopIcon } from 'lucide-react';

import { GitBranchDropdown } from '@/components/git-branch-dropdown';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  | 'loadingWorkspace'
  | 'selectedCwd'
  | 'changeFolder'
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
  changeGitBranch,
  deleteGitBranch,
  renameGitBranch,
  initializeGitRepository,
}: CurrentWorkspaceProps): React.JSX.Element {
  return (
    <section
      className="flex min-h-9 flex-wrap items-center gap-3"
      aria-label="Task environment"
    >
      <Field className="w-auto min-w-0">
        <FieldLabel htmlFor="workspace-folder" className="sr-only">
          Folder location
        </FieldLabel>
        <Select
          items={folders}
          value={selectedCwd}
          onValueChange={changeFolder}
        >
          <SelectTrigger
            id="workspace-folder"
            size="default"
            className="max-w-48 bg-card px-3 text-sm"
            disabled={loadingWorkspace || folders.length === 0}
          >
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              {folders.map((folder) => (
                <SelectItem key={folder.value} value={folder.value}>
                  {folder.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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

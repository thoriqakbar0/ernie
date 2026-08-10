import { GitBranchIcon, LaptopIcon } from 'lucide-react';

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
  'loadingWorkspace' | 'selectedCwd' | 'changeFolder'
> & {
  readonly folders: readonly PrimeAgentFolderChoice[];
};

/** Workspace context shown above Ernie's primary task input. */
export function CurrentWorkspace({
  folders,
  loadingWorkspace,
  selectedCwd,
  changeFolder,
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
            size="sm"
            className="max-w-48 bg-card px-3 text-base"
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

      <Button
        variant="outline"
        className="bg-card px-3 text-base font-normal text-muted-foreground"
      >
        <GitBranchIcon />
        Select branch
      </Button>

      <Button
        variant="outline"
        className="bg-card px-3 text-base font-normal text-muted-foreground"
      >
        <LaptopIcon />
        This Mac
      </Button>
    </section>
  );
}

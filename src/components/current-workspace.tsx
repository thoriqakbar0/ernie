import { FolderIcon } from 'lucide-react';

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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

/** Environment controls shown behind Ernie's primary task input. */
export function CurrentWorkspace({
  folders,
  loadingWorkspace,
  selectedCwd,
  changeFolder,
}: CurrentWorkspaceProps): React.JSX.Element {
  return (
    <section
      className="mx-auto w-full max-w-xl rounded-b-xl bg-muted px-1 pt-3 pb-1"
      aria-label="Task environment"
    >
      <FieldGroup className="h-10 flex-row items-center gap-2">
        <Field className="min-w-0 flex-1">
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
              className="w-full"
              disabled={loadingWorkspace || folders.length === 0}
            >
              <FolderIcon />
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
      </FieldGroup>
    </section>
  );
}

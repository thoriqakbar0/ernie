import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/trovecn/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/trovecn/ui/dialog';

export type RepositoryDialogTarget = Readonly<{
  kind: 'remove' | 'rename';
  label: string;
  path: string;
}>;

interface RepositoryDialogProps {
  readonly target: RepositoryDialogTarget | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRemove: (path: string) => void;
  readonly onRename: (path: string, label: string) => void;
}

/** Focused repository rename and non-destructive sidebar removal dialogs. */
export function RepositoryDialog({
  target,
  onOpenChange,
  onRemove,
  onRename,
}: RepositoryDialogProps): React.JSX.Element {
  const inputId = useId();
  const [label, setLabel] = useState('');

  useEffect(() => setLabel(target?.label ?? ''), [target]);

  const normalizedLabel = label.trim();
  const removing = target?.kind === 'remove';

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (target === null) return;
            if (removing) {
              onRemove(target.path);
            } else if (normalizedLabel.length > 0) {
              onRename(target.path, normalizedLabel);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {removing ? 'Remove repository?' : 'Rename repository'}
            </DialogTitle>
            <DialogDescription>
              {removing
                ? 'This only removes it from the sidebar. Files, Git worktrees, and Agents stay untouched.'
                : 'This changes the sidebar label only. The folder name stays unchanged.'}
            </DialogDescription>
          </DialogHeader>
          {removing ? null : (
            <>
              <label
                htmlFor={inputId}
                className="mt-5 block text-xs font-medium text-muted-foreground"
              >
                Repository label
              </label>
              <input
                id={inputId}
                autoFocus
                value={label}
                className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                onChange={(event) => setLabel(event.target.value)}
              />
            </>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              variant={removing ? 'destructive' : 'default'}
              disabled={!removing && normalizedLabel.length === 0}
            >
              {removing ? 'Remove' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

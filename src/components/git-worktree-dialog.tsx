import { Dialog } from '@base-ui/react/dialog';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface GitWorktreeDialogProps {
  readonly busy: boolean;
  readonly finalFocusRef: React.RefObject<HTMLButtonElement | null>;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly createWorktree: (branchName: string) => void;
}

/** Collect a branch name before creating one local Git worktree. */
export function GitWorktreeDialog({
  busy,
  finalFocusRef,
  open,
  onOpenChange,
  createWorktree,
}: GitWorktreeDialogProps): React.JSX.Element {
  const [branchName, setBranchName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBranchName('');
    setValidationError(null);
  }, [open]);

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedBranchName = branchName.trim();
    if (normalizedBranchName.length === 0) {
      setValidationError('Enter a branch name.');
      return;
    }

    createWorktree(normalizedBranchName);
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 dark:bg-black/40" />
        <Dialog.Popup
          finalFocus={finalFocusRef}
          className="fixed top-1/2 left-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-popover p-5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none"
        >
          <Dialog.Title className="font-heading text-base font-medium">
            New worktree
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Create a branch in a separate working directory.
          </Dialog.Description>

          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="worktree-branch-name">Branch name</Label>
              <Input
                id="worktree-branch-name"
                value={branchName}
                placeholder="feature/my-change"
                spellCheck={false}
                autoCapitalize="none"
                autoComplete="off"
                aria-invalid={validationError === null ? undefined : true}
                aria-describedby={
                  validationError === null ? undefined : 'worktree-branch-error'
                }
                onChange={(event) => {
                  setBranchName(event.target.value);
                  if (validationError !== null) setValidationError(null);
                }}
              />
              {validationError === null ? null : (
                <p
                  id="worktree-branch-error"
                  className="text-xs text-destructive"
                  role="alert"
                >
                  {validationError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Dialog.Close
                render={<Button type="button" variant="ghost" />}
              >
                Cancel
              </Dialog.Close>
              <Button type="submit" disabled={busy}>
                Create worktree
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

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
import type { AgentConversation } from '@/packages/repository-navigation';

interface RenameAgentConversationDialogProps {
  readonly busy: boolean;
  readonly conversation: AgentConversation | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRename: (name: string) => void;
}

/** Rename one Agent conversation through a focused Trove dialog. */
export function RenameAgentConversationDialog({
  busy,
  conversation,
  onOpenChange,
  onRename,
}: RenameAgentConversationDialogProps): React.JSX.Element {
  const inputId = useId();
  const [name, setName] = useState('');

  useEffect(() => {
    setName(conversation?.session.name ?? '');
  }, [conversation]);

  const normalizedName = name.trim();

  return (
    <Dialog
      open={conversation !== null}
      onOpenChange={(open) => onOpenChange(open)}
    >
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (normalizedName.length === 0 || busy) return;
            onRename(normalizedName);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>
              This name is saved in the Prime Agent session.
            </DialogDescription>
          </DialogHeader>
          <label
            htmlFor={inputId}
            className="mt-5 block text-xs font-medium text-muted-foreground"
          >
            Conversation name
          </label>
          <input
            id={inputId}
            autoFocus
            value={name}
            disabled={busy}
            className="mt-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={
                busy ||
                normalizedName.length === 0 ||
                normalizedName === conversation?.session.name
              }
            >
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

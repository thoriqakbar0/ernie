import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  PencilIcon,
} from 'lucide-react';
import type { DragEvent } from 'react';

import type { ThreadConversation } from '@/components/thread-conversation';
import { Button } from '@/components/trovecn/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/trovecn/ui/context-menu';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/trovecn/ui/menu';

interface ThreadRowProps {
  readonly archived: boolean;
  readonly canMoveDown: boolean;
  readonly canMoveUp: boolean;
  readonly detail: string | null;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly importing: boolean;
  readonly selected: boolean;
  readonly thread: ThreadConversation;
  readonly onArchiveChange: (archived: boolean) => void;
  readonly onDragEnd: () => void;
  readonly onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLLIElement>) => void;
  readonly onMoveDown: () => void;
  readonly onMoveUp: () => void;
  readonly onOpen: () => void;
  readonly onRename: () => void;
}

/** Interactive Trove thread row with menu, context menu, and drag affordance. */
export function ThreadRow({
  archived,
  canMoveDown,
  canMoveUp,
  detail,
  disabled,
  dragging,
  importing,
  selected,
  thread,
  onArchiveChange,
  onDragEnd,
  onDragStart,
  onDrop,
  onMoveDown,
  onMoveUp,
  onOpen,
  onRename,
}: ThreadRowProps): React.JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            draggable={!archived}
            data-dragging={dragging}
            className="group/thread relative flex min-w-0 items-center rounded-lg opacity-100 transition-opacity data-[dragging=true]:opacity-40"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(event) => {
              if (archived) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={onDrop}
          />
        }
      >
        <GripVerticalIcon
          aria-hidden="true"
          className="absolute left-1 size-3.5 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/thread:opacity-60 group-focus-within/thread:opacity-60"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          data-active={selected}
          aria-current={selected ? 'page' : undefined}
          aria-label={
            thread.kind === 'saved'
              ? `${thread.session.name}, saved session`
              : thread.session.name
          }
          className="h-9 min-w-0 flex-1 justify-start gap-2 rounded-lg pl-5 pr-1 text-left font-normal text-sidebar-foreground data-active:bg-sidebar-accent hover:bg-sidebar-accent"
          onClick={onOpen}
        >
          <span className="min-w-0 flex-1 truncate">{thread.session.name}</span>
          {importing ? (
            <LoaderCircleIcon
              className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-label="Opening saved session"
            />
          ) : detail === null ? null : (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {detail}
            </span>
          )}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Manage ${thread.session.name}`}
                title={`Manage ${thread.session.name}`}
                className="mr-1 text-muted-foreground opacity-0 group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 aria-expanded:opacity-100"
              />
            }
          >
            <EllipsisIcon />
          </MenuTrigger>
          <MenuContent align="end" side="right" sideOffset={6}>
            <MenuItem onClick={onRename}>
              <PencilIcon />
              Rename
            </MenuItem>
            {archived ? null : (
              <MenuItem disabled={!canMoveUp} onClick={onMoveUp}>
                <ArrowUpIcon />
                Move up
              </MenuItem>
            )}
            {archived ? null : (
              <MenuItem disabled={!canMoveDown} onClick={onMoveDown}>
                <ArrowDownIcon />
                Move down
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem onClick={() => onArchiveChange(!archived)}>
              {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {archived ? 'Restore' : 'Archive'}
            </MenuItem>
          </MenuContent>
        </Menu>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <PencilIcon />
          Rename
        </ContextMenuItem>
        {archived ? null : (
          <ContextMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
            <ArrowUpIcon />
            Move up
          </ContextMenuItem>
        )}
        {archived ? null : (
          <ContextMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
            <ArrowDownIcon />
            Move down
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onArchiveChange(!archived)}>
          {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
          {archived ? 'Restore' : 'Archive'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

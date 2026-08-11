import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisIcon,
  GripVerticalIcon,
  LoaderCircleIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
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
  readonly detail: string | null;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly importing: boolean;
  readonly pinned: boolean;
  readonly selected: boolean;
  readonly thread: ThreadConversation;
  readonly onArchiveChange: (archived: boolean) => void;
  readonly onDragEnd: () => void;
  readonly onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLLIElement>) => void;
  readonly onOpen: () => void;
  readonly onPinChange: (pinned: boolean) => void;
  readonly onRename: () => void;
}

/** Interactive Trove thread row with menu, context menu, and drag affordance. */
export function ThreadRow({
  archived,
  detail,
  disabled,
  dragging,
  importing,
  pinned,
  selected,
  thread,
  onArchiveChange,
  onDragEnd,
  onDragStart,
  onDrop,
  onOpen,
  onPinChange,
  onRename,
}: ThreadRowProps): React.JSX.Element {
  const reorderable = !archived && !pinned;
  const activity = thread.kind === 'live' ? thread.session.activity : 'idle';

  const activityMark = {
    working: (
      <LoaderCircleIcon
        aria-label="Working"
        className="size-3 animate-spin text-muted-foreground motion-reduce:animate-none"
      />
    ),
    queued: (
      <span
        aria-label="Queued"
        className="size-1.5 shrink-0 rounded-full bg-muted-foreground"
      />
    ),
    needs_input: (
      <span
        aria-label="Needs attention"
        className="size-1.5 shrink-0 rounded-full bg-amber-400"
      />
    ),
    idle: null,
  }[activity];

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <li
            draggable={reorderable}
            data-dragging={dragging}
            className="group/thread relative flex min-w-0 items-center rounded-lg opacity-100 transition-opacity data-[dragging=true]:opacity-40"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(event) => {
              if (!reorderable) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={onDrop}
          />
        }
      >
        {pinned ? (
          <PinIcon
            aria-hidden="true"
            className="absolute left-1 size-3.5 text-muted-foreground"
          />
        ) : (
          <GripVerticalIcon
            aria-hidden="true"
            className="absolute left-1 size-3.5 cursor-grab text-muted-foreground opacity-0 transition-opacity group-hover/thread:opacity-60 group-focus-within/thread:opacity-60"
          />
        )}
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
          className={`${pinned ? 'h-10' : 'h-9'} min-w-0 flex-1 justify-start gap-2 rounded-lg pl-5 pr-1 text-left font-normal text-sidebar-foreground data-active:bg-sidebar-accent hover:bg-sidebar-accent`}
          onClick={onOpen}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{thread.session.name}</span>
            {pinned && detail !== null ? (
              <span className="block truncate text-[10px] text-muted-foreground">
                {detail}
              </span>
            ) : null}
          </span>
          {importing ? (
            <LoaderCircleIcon
              className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-label="Opening saved session"
            />
          ) : (
            <span className="flex shrink-0 items-center gap-1.5">
              {activityMark}
              {pinned || detail === null ? null : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {detail}
                </span>
              )}
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
              <MenuItem onClick={() => onPinChange(!pinned)}>
                {pinned ? <PinOffIcon /> : <PinIcon />}
                {pinned ? 'Unpin' : 'Pin to top'}
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
          <ContextMenuItem onClick={() => onPinChange(!pinned)}>
            {pinned ? <PinOffIcon /> : <PinIcon />}
            {pinned ? 'Unpin' : 'Pin to top'}
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

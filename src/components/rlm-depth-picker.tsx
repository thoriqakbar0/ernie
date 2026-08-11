import { MinusIcon, PlusIcon } from 'lucide-react';
import { memo } from 'react';

import { Button } from '@/components/trovecn/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/trovecn/ui/popover';

interface RlmDepthPickerProps {
  readonly busy: boolean;
  readonly depth: number | null;
  readonly onDepthChange: (depth: string | null) => void;
}

const maximumRlmDepth = 20;

/** Edit the active Prime Agent session's delegation depth from zero through twenty. */
export const RlmDepthPicker = memo(function RlmDepthPicker({
  busy,
  depth,
  onDepthChange,
}: RlmDepthPickerProps): React.JSX.Element {
  function requestDepth(nextDepth: number): void {
    if (
      !Number.isSafeInteger(nextDepth) ||
      nextDepth < 0 ||
      nextDepth > maximumRlmDepth
    ) {
      return;
    }

    if (nextDepth !== depth) {
      onDepthChange(String(nextDepth));
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-label={depth === null ? 'Depth unavailable' : undefined}
            className="gap-2 px-3 font-normal text-muted-foreground"
          />
        }
      >
        <span>Depth</span>
        <span className="font-medium tabular-nums text-foreground">
          {depth ?? '—'}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={depth === null ? 'Depth unavailable' : 'Adjust Agent depth'}
        className={depth === null ? 'w-52 p-2.5' : 'w-auto p-1'}
      >
        {depth === null ? (
          <p className="text-xs leading-5 text-muted-foreground">
            Available after starting an Agent.
          </p>
        ) : (
          <div
            role="group"
            aria-label="Agent depth"
            className="inline-flex items-center gap-0.5"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy || depth === 0}
              aria-label="Decrease Agent depth"
              className="text-muted-foreground hover:text-foreground disabled:opacity-35"
              onClick={() => requestDepth(depth - 1)}
              onPointerUp={(event) => event.currentTarget.blur()}
            >
              <MinusIcon
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.75}
              />
            </Button>
            <output
              aria-label="Current Agent depth"
              className="w-8 text-center text-sm font-medium tabular-nums text-foreground"
            >
              {depth}
            </output>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={busy || depth === maximumRlmDepth}
              aria-label="Increase Agent depth"
              className="text-muted-foreground hover:text-foreground disabled:opacity-35"
              onClick={() => requestDepth(depth + 1)}
              onPointerUp={(event) => event.currentTarget.blur()}
            >
              <PlusIcon
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.75}
              />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

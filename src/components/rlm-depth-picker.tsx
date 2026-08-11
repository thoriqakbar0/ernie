import { NumberField } from '@base-ui/react/number-field';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { memo, useState } from 'react';

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
  const [draftDepth, setDraftDepth] = useState<number | null>(depth);

  function commitDepth(nextDepth: number | null): void {
    if (
      nextDepth === null ||
      !Number.isSafeInteger(nextDepth) ||
      nextDepth < 0 ||
      nextDepth > maximumRlmDepth
    ) {
      setDraftDepth(depth);
      return;
    }

    if (nextDepth !== depth) {
      onDepthChange(String(nextDepth));
      setDraftDepth(depth);
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
          <NumberField.Root
            value={draftDepth}
            min={0}
            max={maximumRlmDepth}
            step={1}
            disabled={busy}
            onValueChange={setDraftDepth}
            onValueCommitted={commitDepth}
          >
            <NumberField.Group
              aria-label="Agent depth"
              className="inline-flex items-center gap-0.5"
            >
              <NumberField.Decrement
                aria-label="Decrease Agent depth"
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-35"
                  />
                }
                onPointerUp={(event) => event.currentTarget.blur()}
              >
                <MinusIcon
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
              </NumberField.Decrement>
              <NumberField.Input
                aria-label="Agent depth"
                inputMode="numeric"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitDepth(draftDepth);
                  }
                }}
                className="h-7 w-8 rounded-md bg-transparent px-0 text-center text-sm font-medium tabular-nums outline-none selection:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring/50"
              />
              <NumberField.Increment
                aria-label="Increase Agent depth"
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-35"
                  />
                }
                onPointerUp={(event) => event.currentTarget.blur()}
              >
                <PlusIcon
                  aria-hidden="true"
                  className="size-4"
                  strokeWidth={1.75}
                />
              </NumberField.Increment>
            </NumberField.Group>
          </NumberField.Root>
        )}
      </PopoverContent>
    </Popover>
  );
});

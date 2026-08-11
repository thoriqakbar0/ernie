import { NumberField } from '@base-ui/react/number-field';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { memo, useId, useRef, useState } from 'react';

import { Button } from '@/components/trovecn/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
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
  const [keyboardFocusWithin, setKeyboardFocusWithin] = useState(false);
  const pointerInteraction = useRef(false);
  const labelId = useId();
  const descriptionId = useId();

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
      <PopoverContent align="end" className="w-64">
        <PopoverHeader>
          <PopoverTitle id={labelId}>Agent depth</PopoverTitle>
          <PopoverDescription id={descriptionId}>
            <span translate="no">RLM</span> sets the maximum recursive Agent
            delegation depth, from 0 through 20.
          </PopoverDescription>
        </PopoverHeader>
        {depth === null ? (
          <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Available after starting an Agent.
          </p>
        ) : (
          <NumberField.Root
            value={draftDepth}
            min={0}
            max={maximumRlmDepth}
            step={1}
            disabled={busy}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            onValueChange={setDraftDepth}
            onValueCommitted={commitDepth}
            onPointerDownCapture={() => {
              pointerInteraction.current = true;
              setKeyboardFocusWithin(false);
            }}
            onPointerUpCapture={() => {
              pointerInteraction.current = false;
            }}
            onPointerCancelCapture={() => {
              pointerInteraction.current = false;
            }}
            onKeyDownCapture={() => {
              pointerInteraction.current = false;
            }}
            onFocusCapture={() => {
              if (!pointerInteraction.current) setKeyboardFocusWithin(true);
            }}
            onBlurCapture={(event) => {
              const nextTarget = event.relatedTarget;
              if (
                !(nextTarget instanceof Node) ||
                !event.currentTarget.contains(nextTarget)
              ) {
                setKeyboardFocusWithin(false);
              }
            }}
          >
            <NumberField.Group
              aria-labelledby={labelId}
              className={`mt-4 flex items-center justify-between rounded-lg bg-muted/60 p-1 ${keyboardFocusWithin ? 'ring-3 ring-ring/50' : ''}`}
            >
              <NumberField.Decrement
                aria-label="Decrease Agent depth"
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-35"
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
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                inputMode="numeric"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitDepth(draftDepth);
                  }
                }}
                className="h-8 w-14 bg-transparent px-0 text-center text-base font-medium tabular-nums outline-none selection:bg-primary/20"
              />
              <NumberField.Increment
                aria-label="Increase Agent depth"
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-35"
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

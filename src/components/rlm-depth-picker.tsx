import { NumberField } from '@base-ui/react/number-field';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { memo, useId, useState } from 'react';

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
    <NumberField.Root
      value={draftDepth}
      min={0}
      max={maximumRlmDepth}
      step={1}
      disabled={busy || depth === null}
      onValueChange={setDraftDepth}
      onValueCommitted={commitDepth}
      className="transition-opacity data-disabled:opacity-50 motion-reduce:transition-none"
    >
      <NumberField.Group className="inline-flex h-8 items-center overflow-hidden rounded-full border border-border bg-background text-sm shadow-[0_1px_2px_oklch(0_0_0/0.04)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.04)]">
        <span id={labelId} className="pr-2 pl-3 whitespace-nowrap select-none">
          <span translate="no">RLM</span> depth
        </span>
        <NumberField.Decrement
          aria-label="Decrease RLM depth"
          className="relative flex h-full w-8 items-center justify-center border-l border-border text-muted-foreground outline-none select-none transition-colors after:absolute after:-inset-y-1 hover:bg-muted hover:text-foreground active:bg-accent disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
        >
          <MinusIcon aria-hidden="true" className="size-3.5" />
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
          className="h-full w-8 border-x border-border bg-transparent px-0 text-center text-sm tabular-nums outline-none selection:bg-primary/20"
        />
        <NumberField.Increment
          aria-label="Increase RLM depth"
          className="relative flex h-full w-8 items-center justify-center text-muted-foreground outline-none select-none transition-colors after:absolute after:-inset-y-1 hover:bg-muted hover:text-foreground active:bg-accent disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none"
        >
          <PlusIcon aria-hidden="true" className="size-3.5" />
        </NumberField.Increment>
      </NumberField.Group>
      <span id={descriptionId} className="sr-only">
        Maximum recursive agent depth, from 0 through 20.
      </span>
    </NumberField.Root>
  );
});

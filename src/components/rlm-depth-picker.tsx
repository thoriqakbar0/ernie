import { NumberField } from '@base-ui/react/number-field';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { memo, useId, useRef, useState } from 'react';

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
    <NumberField.Root
      value={draftDepth}
      min={0}
      max={maximumRlmDepth}
      step={1}
      disabled={busy || depth === null}
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
      className="transition-opacity data-disabled:opacity-50 motion-reduce:transition-none"
    >
      <NumberField.Group
        className={`inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5 text-sm shadow-[0_1px_2px_oklch(0_0_0/0.04)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.04)] ${keyboardFocusWithin ? 'border-ring ring-3 ring-ring/50' : 'border-input'}`}
      >
        <span
          id={labelId}
          className="pr-1.5 pl-2 whitespace-nowrap text-muted-foreground select-none"
        >
          <span translate="no">RLM</span> depth
        </span>
        <NumberField.Decrement
          aria-label="Decrease RLM depth"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none select-none transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transform-none motion-reduce:transition-none"
          onPointerUp={(event) => event.currentTarget.blur()}
        >
          <MinusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
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
          className="h-7 w-7 rounded-md bg-muted/55 px-0 text-center text-sm font-medium tabular-nums outline-none selection:bg-primary/20"
        />
        <NumberField.Increment
          aria-label="Increase RLM depth"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none select-none transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transform-none motion-reduce:transition-none"
          onPointerUp={(event) => event.currentTarget.blur()}
        >
          <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </NumberField.Increment>
      </NumberField.Group>
      <span id={descriptionId} className="sr-only">
        Maximum recursive agent depth, from 0 through 20.
      </span>
    </NumberField.Root>
  );
});

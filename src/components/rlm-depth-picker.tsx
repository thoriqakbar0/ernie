import { NumberField } from '@base-ui/react/number-field';
import { Popover } from '@base-ui/react/popover';
import { ChevronDownIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

interface RlmDepthPickerProps {
  readonly busy: boolean;
  readonly depth: number | null;
  readonly onDepthChange: (depth: string | null) => void;
}

function explainDepth(depth: number | null): string {
  if (depth === 0) {
    return 'Only the main agent works. It cannot create subagents.';
  }
  if (depth === 1) {
    return 'The main agent can create subagents. They cannot delegate again.';
  }
  if (depth === 2) {
    return 'The main agent can create subagents, and those agents can delegate once more.';
  }
  if (depth !== null) {
    return `The main agent and its subagents can delegate through ${depth} nested levels.`;
  }
  return 'Enter a non-negative whole number.';
}

/** Select the maximum delegation depth for the active Prime Agent session. */
export function RlmDepthPicker({
  busy,
  depth,
  onDepthChange,
}: RlmDepthPickerProps): React.JSX.Element {
  const [draftDepth, setDraftDepth] = useState<number | null>(depth);
  const titleId = useId();
  const descriptionId = useId();
  const explanationId = useId();
  const noteId = useId();

  useEffect(() => {
    setDraftDepth(depth);
  }, [depth]);

  function commitDepth(nextDepth: number | null): void {
    if (
      nextDepth === null ||
      !Number.isSafeInteger(nextDepth) ||
      nextDepth < 0
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
    <Popover.Root>
      <Popover.Trigger
        className="group/depth-trigger flex h-8 items-center justify-between gap-1.5 rounded-full border border-border bg-background py-0 pr-2.5 pl-3 text-sm font-normal whitespace-nowrap outline-none select-none shadow-[0_1px_2px_oklch(0_0_0/0.04)] transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-muted hover:shadow-[0_0_0_1px_oklch(0_0_0/0.04),0_2px_4px_oklch(0_0_0/0.06)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none dark:bg-input/30 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.04)]"
        disabled={busy || depth === null}
      >
        <span>
          <span translate="no">RLM</span> depth
        </span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs leading-none tabular-nums text-muted-foreground transition-colors duration-150 ease-out group-hover/depth-trigger:bg-background motion-reduce:transition-none">
          {depth === null ? '–' : depth}
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          align="start"
          sideOffset={8}
          className="isolate z-50"
        >
          <Popover.Popup className="w-[20rem] max-w-(--available-width) rounded-xl bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none transition-opacity duration-100 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none">
            <Popover.Title id={titleId} className="text-sm font-medium">
              <span translate="no">RLM</span> depth
            </Popover.Title>
            <Popover.Description
              id={descriptionId}
              className="mt-1 text-sm leading-5 text-muted-foreground"
            >
              <span translate="no">RLM</span> means Recursive Language Model.
              It lets an agent delegate parts of a task to subagents. Depth sets
              how many times that delegation can repeat.
            </Popover.Description>

            <NumberField.Root
              value={draftDepth}
              min={0}
              step={1}
              largeStep={4}
              disabled={busy}
              onValueChange={setDraftDepth}
              onValueCommitted={commitDepth}
              className="mt-4 transition-opacity data-disabled:opacity-60 motion-reduce:transition-none"
            >
              <NumberField.Group className="grid h-11 grid-cols-[2.75rem_1fr_2.75rem] overflow-hidden rounded-lg border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <NumberField.Decrement
                  aria-label="Decrease RLM depth"
                  className="flex items-center justify-center border-r border-input text-muted-foreground outline-none select-none transition-colors hover:bg-muted hover:text-foreground active:bg-accent disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                >
                  <MinusIcon aria-hidden="true" className="size-4" />
                </NumberField.Decrement>
                <NumberField.Input
                  aria-labelledby={titleId}
                  aria-describedby={`${descriptionId} ${explanationId} ${noteId}`}
                  className="min-w-0 bg-transparent px-3 text-center text-base font-medium tabular-nums outline-none"
                />
                <NumberField.Increment
                  aria-label="Increase RLM depth"
                  className="flex items-center justify-center border-l border-input text-muted-foreground outline-none select-none transition-colors hover:bg-muted hover:text-foreground active:bg-accent disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                >
                  <PlusIcon aria-hidden="true" className="size-4" />
                </NumberField.Increment>
              </NumberField.Group>
            </NumberField.Root>

            <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5">
              <p className="text-xs font-medium text-foreground">
                Depth {draftDepth ?? '–'}
              </p>
              <p
                id={explanationId}
                className="mt-1 text-sm leading-5 text-muted-foreground"
              >
                {explainDepth(draftDepth)}
              </p>
            </div>

            <p
              id={noteId}
              className="mt-3 text-xs leading-relaxed text-muted-foreground"
            >
              Depth limits nesting, not the total number of agents.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

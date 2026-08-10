import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

const rlmDepthChoices = Array.from({ length: 9 }, (_, maxDepth) => ({
  label:
    maxDepth === 0
      ? 'RLM depth 0, no recursion'
      : `RLM depth ${maxDepth}`,
  value: String(maxDepth),
}));

interface RlmDepthPickerProps {
  readonly busy: boolean;
  readonly depth: number | null;
  readonly onDepthChange: (depth: string | null) => void;
}

/** Select the maximum delegation depth for the active Prime Agent session. */
export function RlmDepthPicker({
  busy,
  depth,
  onDepthChange,
}: RlmDepthPickerProps): React.JSX.Element {
  const depthLabel = depth === null ? 'Unavailable' : `Depth ${depth}`;

  return (
    <Select
      items={rlmDepthChoices}
      value={depth === null ? null : String(depth)}
      onValueChange={onDepthChange}
    >
      <SelectTrigger
        className="group/depth-trigger h-8 w-auto rounded-full border-border bg-background py-0 pr-2.5 pl-3 text-sm font-normal shadow-[0_1px_2px_oklch(0_0_0/0.04)] transition-[background-color,box-shadow,scale] duration-150 ease-out hover:bg-muted hover:shadow-[0_0_0_1px_oklch(0_0_0/0.04),0_2px_4px_oklch(0_0_0/0.06)] active:scale-[0.96] motion-reduce:transition-none dark:bg-input/30 dark:shadow-[0_0_0_1px_oklch(1_0_0/0.04)]"
        disabled={busy || depth === null}
      >
        <span>
          <span translate="no">RLM</span> depth
        </span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs leading-none tabular-nums text-muted-foreground transition-colors duration-150 ease-out group-hover/depth-trigger:bg-background motion-reduce:transition-none">
          {depth === null ? '–' : depth}
        </span>
      </SelectTrigger>

      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        sideOffset={8}
        className="w-[19rem] rounded-xl p-1"
      >
        <SelectGroup className="grid grid-cols-9 gap-1 p-2">
          <div className="col-span-9 px-1 pb-2">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium">
                <span translate="no">RLM</span> depth
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {depthLabel}
              </p>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Set the maximum recursion depth for this chat.
            </p>
          </div>

          {rlmDepthChoices.map((choice) => (
            <SelectItem
              key={choice.value}
              value={choice.value}
              aria-label={choice.label}
              className="h-8 justify-center rounded-md p-0 text-xs tabular-nums transition-[background-color,color,scale] duration-150 ease-out hover:bg-muted active:scale-[0.96] data-selected:bg-foreground data-selected:text-background data-selected:focus:text-background data-selected:focus:**:text-background motion-reduce:transition-none [&>span:first-child]:justify-center [&>span:last-child]:hidden"
            >
              {choice.value}
            </SelectItem>
          ))}

          <div
            aria-hidden="true"
            className="col-span-9 flex justify-between px-1 pt-1 text-[0.6875rem] text-muted-foreground"
          >
            <span>No recursion</span>
            <span>Maximum</span>
          </div>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

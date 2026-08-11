import { MinusIcon, PlusIcon } from 'lucide-react';
import { memo } from 'react';
import { TextMorph } from 'torph/react';

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

/* ─────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *   0ms   depth changes; old numeral morphs into the new numeral
 * ───────────────────────────────────────────── */
const DEPTH_VALUE_MORPH = {
  spring: { stiffness: 540, damping: 34, mass: 0.6 },
  scale: false,
} as const;

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
            aria-label={
              depth === null ? 'Depth unavailable' : `Depth ${depth}`
            }
            className="gap-2 px-3 font-normal text-muted-foreground"
          />
        }
      >
        <span>Depth</span>
        <TextMorph
          as="span"
          ease={DEPTH_VALUE_MORPH.spring}
          scale={DEPTH_VALUE_MORPH.scale}
          respectReducedMotion
          className="font-medium tabular-nums text-foreground"
        >
          {String(depth ?? '—')}
        </TextMorph>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={depth === null ? 'Depth unavailable' : 'Adjust Agent depth'}
        className={depth === null ? 'w-52 p-2.5' : 'w-36 p-1'}
      >
        {depth === null ? (
          <p className="text-xs leading-5 text-muted-foreground">
            Available after starting an Agent.
          </p>
        ) : (
          <div className="flex flex-col items-center">
            <div
              role="group"
              aria-label="Agent depth"
              className="inline-flex items-center gap-0.5"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={busy || depth === 0}
                aria-label="Decrease Agent depth"
                className="text-muted-foreground hover:text-foreground disabled:opacity-35"
                onClick={() => requestDepth(depth - 1)}
                onPointerUp={(event) => event.currentTarget.blur()}
              >
                <MinusIcon
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
              </Button>
              <output
                aria-label="Current Agent depth"
                className="w-7 text-center text-sm font-medium tabular-nums text-foreground"
              >
                <TextMorph
                  as="span"
                  ease={DEPTH_VALUE_MORPH.spring}
                  scale={DEPTH_VALUE_MORPH.scale}
                  respectReducedMotion
                  className="inline-block"
                >
                  {String(depth)}
                </TextMorph>
              </output>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={busy || depth === maximumRlmDepth}
                aria-label="Increase Agent depth"
                className="text-muted-foreground hover:text-foreground disabled:opacity-35"
                onClick={() => requestDepth(depth + 1)}
                onPointerUp={(event) => event.currentTarget.blur()}
              >
                <PlusIcon
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={1.75}
                />
              </Button>
            </div>
            <p className="px-1 pb-0.5 pt-0.5 text-center text-[10px] leading-4 text-muted-foreground">
              More depth uses more tokens.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

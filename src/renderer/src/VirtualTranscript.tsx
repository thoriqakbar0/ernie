import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactNode, RefObject, UIEventHandler, WheelEventHandler } from "react";
import type { ThreadItem } from "./transcript";

interface VirtualTranscriptProps {
  readonly items: readonly ThreadItem[];
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly busy: boolean;
  readonly empty?: ReactNode;
  readonly renderItem: (item: ThreadItem) => ReactNode;
  readonly onScroll: UIEventHandler<HTMLDivElement>;
  readonly onWheel: WheelEventHandler<HTMLDivElement>;
}

function estimatedItemHeight(item: ThreadItem): number {
  switch (item.kind) {
    case "assistant": return 112;
    case "delegation": return 76;
    case "ipython_execution": return 180;
    case "notice": return 52;
    case "tool": return 68;
    case "user": return 88;
  }
}

/** Virtualized, dynamically measured conversation history with stable item identity. */
export function VirtualTranscript({ items, scrollRef, busy, empty, renderItem, onScroll, onWheel }: VirtualTranscriptProps) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimatedItemHeight(items[index] ?? { id: "estimate", kind: "notice", text: "", tone: "neutral" }),
    getItemKey: (index) => items[index]?.id ?? index,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return <div
    className="transcript"
    ref={scrollRef}
    onScroll={onScroll}
    onWheel={onWheel}
    role="region"
    aria-label="Virtualized conversation viewport"
    aria-busy={busy}
  >
    {items.length === 0 ? empty : <div className="virtual-transcript-canvas" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index];
        if (!item) return null;
        return <div
          key={item.id}
          ref={virtualizer.measureElement}
          data-index={virtualItem.index}
          className="virtual-transcript-row"
          style={{ transform: `translateY(${virtualItem.start}px)` }}
        >{renderItem(item)}</div>;
      })}
    </div>}
  </div>;
}

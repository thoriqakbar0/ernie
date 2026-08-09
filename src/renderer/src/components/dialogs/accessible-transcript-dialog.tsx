import { useId, useMemo, useRef, useState } from "react";
import type { ThreadItem } from "../../lib/transcript";
import { assistantText } from "../../lib/transcript";
import { ModalDialog } from "./modal-dialog";

const PAGE_SIZE = 40;
function accessibleText(item: ThreadItem, assistantLabel: string, promptLabel: string): string {
  switch (item.kind) {
    case "user": return `${promptLabel}: ${item.text}`;
    case "assistant": return `${assistantLabel}: ${assistantText(item)}`;
    case "tool": return `Tool ${item.name}, ${item.phase === "end" ? item.isError ? "failed" : "completed" : "running"}. ${item.detail}`;
    case "ipython_execution": return `IPython ${item.status}. Code: ${item.code}. Output: ${item.detail}`;
    case "delegation": return `Subagent ${item.name}, ${item.status}. ${item.task}. ${item.detail}`;
    case "notice": return item.text;
  }
}

/** Explicit paged, nonvirtual transcript for assistive-technology history browsing. */
export function AccessibleTranscriptDialog({ items, assistantLabel, promptLabel, visuallyHiddenTrigger = false }: {
  readonly items: readonly ThreadItem[];
  readonly assistantLabel: string;
  readonly promptLabel: string;
  readonly visuallyHiddenTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(() => Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1));
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = useMemo(() => items.slice(start, start + PAGE_SIZE), [items, start]);
  return <>
    <button type="button" className={`accessible-transcript-trigger${visuallyHiddenTrigger ? " sr-only" : ""}`} onClick={() => { setPage(Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1)); setOpen(true); }}>Browse full transcript</button>
    <ModalDialog open={open} onRequestClose={() => setOpen(false)} labelledBy={titleId} className="accessible-transcript-dialog" initialFocusRef={closeRef}>
      <header className="accessible-transcript-heading"><div><h2 id={titleId}>Full transcript</h2><p>Nonvirtualized page {safePage + 1} of {pageCount}</p></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close full transcript">×</button></header>
      {visible.length > 0 ? <ol start={start + 1} className="accessible-transcript-list">{visible.map((item) => <li key={item.id}>{accessibleText(item, assistantLabel, promptLabel)}</li>)}</ol> : <p className="accessible-transcript-empty">No transcript items yet.</p>}
      <footer className="accessible-transcript-pager"><button type="button" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous page</button><span aria-live="polite">Items {visible.length === 0 ? 0 : start + 1}–{start + visible.length} of {items.length}</span><button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next page</button></footer>
    </ModalDialog>
  </>;
}

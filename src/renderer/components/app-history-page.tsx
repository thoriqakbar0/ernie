import { useCallback, useEffect, useRef, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, ImageIcon, MoreHorizontalIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { CheckpointPage, CheckpointSummary, FileChanges, HistoryResponse, HistoryStatus, type HistoryRequest } from "../../packages/app-history"
import { useAppNavigation } from "../app-navigation"
import { CheckpointSource } from "./checkpoint-source"
import { styles } from "./app-settings.styles"

type Client = (input: HistoryRequest) => Promise<unknown>
const origins = { baseline: "Initial app", customization: "Ernie customization", external: "External changes", manual: "Manual checkpoint", before_restore: "Before restore", official_update: "Official update", launch: "Changes found on launch" }
/** Full history page uses the same controller as independent recovery and agents. */
export function AppHistoryPage({ client, embedded = false }: { client?: Client; embedded?: boolean } = {}) {
  const rpc = useRpc()
  const { navigate } = useAppNavigation()
  const request = useCallback(async (input: HistoryRequest) => {
    const response = Schema.decodeUnknownSync(HistoryResponse)(await (client ? client(input) : rpc.app.appHistory.request(input)))
    if (!response.ok) throw new Error(`${response.error.message} ${response.error.nextAction ?? ""}`)
    return response.value
  }, [client, rpc])
  const [items, setItems] = useState<readonly CheckpointSummary[]>([])
  const [status, setStatus] = useState<typeof HistoryStatus.Type>()
  const [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<CheckpointSummary>()
  const [changes, setChanges] = useState<typeof FileChanges.Type>()
  const [source, setSource] = useState<string>()
  const [sourcePage, setSourcePage] = useState<{ path: string; offset: number; tree: string }>()
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [pending, setPending] = useState<string | null>(null)
  const busy = pending !== null
  const revision = useRef(0)
  const detail = useRef<HTMLElement>(null)
  const refresh = useCallback(async () => {
    const [health, page] = await Promise.all([request({ method: "history.status" }), request({ method: "history.list" })])
    setStatus(Schema.decodeUnknownSync(HistoryStatus)(health))
    const parsed = Schema.decodeUnknownSync(CheckpointPage)(page)
    setItems(parsed.items); setCursor(parsed.cursor)
  }, [request])
  useEffect(() => { let live = true; void refresh().catch(error => { if (live) setError(error instanceof Error ? error.message : "History unavailable") }); return () => { live = false; revision.current++ } }, [refresh])
  async function act(operation: () => Promise<void>, label = "Updating…") {
    setPending(label); setError(undefined); setNotice(undefined)
    try { await operation() } catch (cause) { setError(cause instanceof Error ? cause.message : "History could not complete this action.") } finally { setPending(null) }
  }
  async function inspect(item: CheckpointSummary) {
    const current = ++revision.current
    setSelected(item); setChanges(undefined); setSource(undefined); setSourcePage(undefined)
    const diff = Schema.decodeUnknownSync(FileChanges)(await request({ method: "history.diff", checkpointId: item.id }))
    if (revision.current === current) { setChanges(diff) }
  }
  async function readSource(path: string, offset = 0, expectedTree?: string) {
    if (!selected) return
    const content = await request({ method: "history.diff", checkpointId: selected.id, path, offset, expectedTree })
    const paging = Schema.decodeUnknownSync(Schema.Struct({ currentTree: Schema.String, before: Schema.NullOr(Schema.Struct({ nextOffset: Schema.optional(Schema.NullOr(Schema.Number)) })), current: Schema.NullOr(Schema.Struct({ nextOffset: Schema.optional(Schema.NullOr(Schema.Number)) })) }))(content)
    const next = paging.before?.nextOffset ?? paging.current?.nextOffset
    setSource(JSON.stringify(content, null, 2)); setSourcePage(next != null ? { path, offset: next, tree: paging.currentTree } : undefined)
  }
  return <section aria-label="App history" {...stylex.props(!embedded && styles.page)}><div {...stylex.props(styles.content)}>
    {!embedded ? <header {...stylex.props(styles.header)}><button type="button" aria-label="Back to settings" onClick={() => navigate("settings")} {...stylex.props(styles.button)}><ArrowLeftIcon size={18}/></button><h1 {...stylex.props(styles.title)}>App history</h1></header> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {pending ? <p role="status" {...stylex.props(styles.description)}>{pending}</p> : null}
    {status ? <>

      <div {...stylex.props(styles.historyToolbar)}>
        <h2 {...stylex.props(styles.scopeTitle)}>Checkpoints</h2>
        <div {...stylex.props(styles.historyToolbarActions)}>
        <button disabled={busy} type="button" {...stylex.props(styles.button, styles.historyPrimary)} onClick={() => void act(async () => { await request({ method: "history.checkpoint", requestId: crypto.randomUUID(), title: "Manual checkpoint" }); await refresh(); setNotice("Checkpoint saved.") }, "Saving…")}>{pending === "Saving…" ? "Saving…" : "Save checkpoint"}</button>

        <details onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus() } }} {...stylex.props(styles.historyMenu)}><summary aria-label="History actions" {...stylex.props(styles.button)}><MoreHorizontalIcon size={16}/></summary><div {...stylex.props(styles.historyMenuPanel)}>        <button disabled={busy} type="button" {...stylex.props(styles.button)} onClick={() => void act(refresh, "Refreshing…")}>{pending === "Refreshing…" ? "Refreshing…" : "Refresh"}</button>
        {status.lastRecoveryId ? <button disabled={busy} type="button" {...stylex.props(styles.button)} onClick={() => void act(async () => inspect(Schema.decodeUnknownSync(CheckpointSummary)(await request({ method: "history.inspect", checkpointId: status.lastRecoveryId! }))))}>Review previous state</button> : null}</div></details>
        </div>
      </div>
      {!items.length ? <p>No saved checkpoints yet.</p> : null}
      <ol aria-label="Saved checkpoints" {...stylex.props(styles.list, styles.checkpointList)}>{items.map(item => <li key={item.id}><button disabled={busy} type="button" aria-expanded={selected?.id === item.id} aria-controls={selected?.id === item.id ? `checkpoint-panel-${item.id}` : undefined} onClick={() => { if (selected?.id === item.id) { revision.current++; setSelected(undefined) } else { void act(() => inspect(item), "Inspecting checkpoint…") } }} {...stylex.props(styles.button, styles.checkpointRow, status.currentCheckpointId === item.id && styles.currentCheckpoint, selected?.id === item.id && styles.selectedCheckpoint)}>
        <span {...stylex.props(styles.checkpointText)}><span {...stylex.props(styles.checkpointTitle)}>{item.title}</span><span {...stylex.props(styles.checkpointMeta)}><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.createdAt))}</time> · {item.changedFileCount} {item.changedFileCount === 1 ? "file" : "files"} changed</span></span>
        <span role="img" aria-label="No screenshot captured" title="No screenshot captured" {...stylex.props(styles.screenshotStack)}><span {...stylex.props(styles.screenshotBack)}/><span {...stylex.props(styles.screenshotFront)}><ImageIcon size={14}/></span></span>
        <span {...stylex.props(styles.checkpointBadge)}>{status.currentCheckpointId === item.id ? "Current" : item.knownWorking ? "Startup checked" : item.restorable ? "Saved" : "Unavailable"}</span><span aria-hidden="true">{selected?.id === item.id ? "−" : "+"}</span>
      </button>
    {selected?.id === item.id ? <section ref={detail} tabIndex={-1} id={`checkpoint-panel-${item.id}`} aria-label="Checkpoint details" {...stylex.props(styles.accordionDetail)}>
      <header {...stylex.props(styles.detailHeader)}><h2 {...stylex.props(styles.detailTitle)}>{selected.title}</h2><span {...stylex.props(styles.detailBadge, selected.complete && styles.completeBadge)}>{selected.complete ? "Complete" : "Incomplete"}</span></header>
      <div {...stylex.props(styles.detailMetric)}><strong {...stylex.props(styles.detailCount)}>{changes?.total ?? "…"}</strong><span {...stylex.props(styles.description)}>{changes?.total === 1 ? "file changed" : "files changed"}<br/>from the current app</span></div>
      <dl {...stylex.props(styles.detailFacts)}>
        <div {...stylex.props(styles.detailFact)}><dt>Saved</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div>
        <div {...stylex.props(styles.detailFact)}><dt>Source</dt><dd>{origins[selected.origin]}</dd></div>
        <div {...stylex.props(styles.detailFact)}><dt>Captured files</dt><dd>{selected.fileCount}</dd></div>
        <div {...stylex.props(styles.detailFact)}><dt>Startup</dt><dd>{selected.knownWorking ? "Checked" : "Not checked"}</dd></div>
      </dl>
      <details {...stylex.props(styles.technicalDetails)}><summary {...stylex.props(styles.technicalSummary)}><span>Technical details</span><ChevronDownIcon size={16} aria-hidden="true" {...stylex.props(styles.technicalChevron)}/></summary><p {...stylex.props(styles.description)}>Startup checks do not verify individual features.</p>{selected.proposedTitle ? <p {...stylex.props(styles.description)}>Suggested title; it does not verify authorship.</p> : null}{changes?.items.map(file => <button key={file.path} type="button" {...stylex.props(styles.button, styles.fileRow)} onClick={() => void act(() => readSource(file.path))}><span {...stylex.props(styles.fileChange)}>{file.change}</span><code {...stylex.props(styles.filePath)}>{file.path}</code><ChevronRightIcon size={14} aria-hidden="true"/></button>)}
        {changes?.cursor ? <button type="button" {...stylex.props(styles.button)} onClick={() => void act(async () => { const page = Schema.decodeUnknownSync(FileChanges)(await request({ method: "history.diff", checkpointId: selected.id, cursor: changes.cursor! })); setChanges({ ...page, items: [...changes.items, ...page.items] }) })}>More changed files</button> : null}
        {source ? <pre {...stylex.props(styles.pre)}><CheckpointSource source={source}/></pre> : null}
        {sourcePage ? <button type="button" {...stylex.props(styles.button)} onClick={() => void act(() => readSource(sourcePage.path, sourcePage.offset, sourcePage.tree))}>Next source page</button> : null}
      </details>
      {!selected.restorable ? <p>Restoration unavailable: {selected.reason}</p> : null}
    </section> : null}
</li>)}</ol>
      <p role="status" {...stylex.props(styles.historyStatus)}>{status.captureError?.message ?? (status.unsavedChanges ? "Changes since last checkpoint" : "No unsaved changes.")}</p>
      {cursor ? <button type="button" disabled={busy} {...stylex.props(styles.button)} onClick={() => void act(async () => { const page = Schema.decodeUnknownSync(CheckpointPage)(await request({ method: "history.list", cursor })); setItems(previous => [...previous, ...page.items]); setCursor(page.cursor) })}>Older checkpoints</button> : null}
    </> : !error ? <p role="status">Loading app history…</p> : null}

  </div></section>
}

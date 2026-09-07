import { useCallback, useEffect, useRef, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import { ArrowLeftIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { CheckpointPage, CheckpointSummary, FileChanges, HistoryResponse, HistoryStatus, type HistoryRequest } from "../../packages/app-history"
import { useAppNavigation } from "../app-navigation"
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
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  const detail = useRef<HTMLElement>(null)
  const refresh = useCallback(async () => {
    const [health, page] = await Promise.all([request({ method: "history.status" }), request({ method: "history.list" })])
    setStatus(Schema.decodeUnknownSync(HistoryStatus)(health))
    const parsed = Schema.decodeUnknownSync(CheckpointPage)(page)
    setItems(parsed.items); setCursor(parsed.cursor)
  }, [request])
  useEffect(() => { let live = true; void refresh().catch(error => { if (live) setError(error instanceof Error ? error.message : "History unavailable") }); return () => { live = false; revision.current++ } }, [refresh])
  async function act(operation: () => Promise<void>) {
    setBusy(true); setError(undefined); setNotice(undefined)
    try { await operation() } catch (cause) { setError(cause instanceof Error ? cause.message : "History could not complete this action.") } finally { setBusy(false) }
  }
  async function inspect(item: CheckpointSummary) {
    const current = ++revision.current
    setSelected(item); setChanges(undefined); setSource(undefined); setSourcePage(undefined)
    const diff = Schema.decodeUnknownSync(FileChanges)(await request({ method: "history.diff", checkpointId: item.id }))
    if (revision.current === current) { setChanges(diff); detail.current?.focus() }
  }
  async function readSource(path: string, offset = 0, expectedTree?: string) {
    if (!selected) return
    const content = await request({ method: "history.diff", checkpointId: selected.id, path, offset, expectedTree })
    const paging = Schema.decodeUnknownSync(Schema.Struct({ currentTree: Schema.String, before: Schema.NullOr(Schema.Struct({ nextOffset: Schema.optional(Schema.NullOr(Schema.Number)) })), current: Schema.NullOr(Schema.Struct({ nextOffset: Schema.optional(Schema.NullOr(Schema.Number)) })) }))(content)
    const next = paging.before?.nextOffset ?? paging.current?.nextOffset
    setSource(JSON.stringify(content, null, 2)); setSourcePage(next != null ? { path, offset: next, tree: paging.currentTree } : undefined)
  }
  async function restore() {
    if (!selected) return
    const proposal = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(await request({ method: "history.prepare_restore", checkpointId: selected.id, requestId: crypto.randomUUID() }))
    await request({ method: "history.request_restore", proposalId: proposal.id })
    setNotice("Your restore review is open in Ernie’s independent recovery window. Approve it there to replace app changes.")
  }
  return <section aria-label="App history" {...stylex.props(!embedded && styles.page)}><div {...stylex.props(styles.content)}>
    {!embedded ? <header {...stylex.props(styles.header)}><button type="button" aria-label="Back to settings" onClick={() => navigate("settings")} {...stylex.props(styles.button)}><ArrowLeftIcon size={18}/></button><h1 {...stylex.props(styles.title)}>App history</h1></header> : null}
    <p {...stylex.props(styles.description)}>Return to an earlier saved app. Your conversations and Agents stay.</p>
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {status ? <>
      <p role="status" {...stylex.props(styles.description)}>{status.captureError?.message ?? (status.unsavedChanges ? "Changes since last checkpoint" : "App source matches its saved checkpoint.")}</p>
      <div {...stylex.props(styles.actions)}>
        <button disabled={busy} type="button" {...stylex.props(styles.button)} onClick={() => void act(async () => { await request({ method: "history.checkpoint", requestId: crypto.randomUUID(), title: "Manual checkpoint" }); await refresh() })}>Save checkpoint now</button>
        <button disabled={busy} type="button" {...stylex.props(styles.button)} onClick={() => void act(refresh)}>Refresh</button>
        {status.lastRecoveryId ? <button disabled={busy} type="button" {...stylex.props(styles.button)} onClick={() => void act(async () => inspect(Schema.decodeUnknownSync(CheckpointSummary)(await request({ method: "history.inspect", checkpointId: status.lastRecoveryId! }))))}>Return to previous state</button> : null}
      </div>
      {!items.length ? <p>No saved checkpoints yet.</p> : null}
      <ol {...stylex.props(styles.list)}>{items.map(item => <li key={item.id}><button type="button" aria-pressed={selected?.id === item.id} onClick={() => void act(() => inspect(item))} {...stylex.props(styles.button, styles.row)}><span>{item.title}<br/><span {...stylex.props(styles.description)}>{new Date(item.createdAt).toLocaleString()} · {origins[item.origin]} · {item.changedFileCount} changed files</span></span><span>{status.currentCheckpointId === item.id ? "Current" : item.knownWorking ? "Startup checked" : item.restorable ? "Saved" : "Unavailable"}</span></button></li>)}</ol>
      {cursor ? <button type="button" disabled={busy} {...stylex.props(styles.button)} onClick={() => void act(async () => { const page = Schema.decodeUnknownSync(CheckpointPage)(await request({ method: "history.list", cursor })); setItems(previous => [...previous, ...page.items]); setCursor(page.cursor) })}>Older checkpoints</button> : null}
    </> : !error ? <p role="status">Loading app history…</p> : null}
    {selected ? <section ref={detail} tabIndex={-1} aria-label="Checkpoint details" {...stylex.props(styles.detail)}>
      <h2>{selected.title}</h2><p {...stylex.props(styles.description)}>{selected.complete ? "Complete source checkpoint" : "Incomplete checkpoint"} · {selected.fileCount} captured files. {selected.knownWorking ? "Startup readiness completed; individual features were not verified." : "Startup has not been checked."}</p>
      {selected.proposedTitle ? <p {...stylex.props(styles.description)}>Title proposed by an editing client. File changes below are controller facts; registration does not prove authorship.</p> : null}
      <p>{changes ? `${changes.total} files differ from the current app.` : "Inspecting changes…"}</p>
      <details><summary>Technical details</summary>{changes?.items.map(file => <button key={file.path} type="button" {...stylex.props(styles.button)} onClick={() => void act(() => readSource(file.path))}>{file.change}: {file.path}</button>)}
        {changes?.cursor ? <button type="button" {...stylex.props(styles.button)} onClick={() => void act(async () => { const page = Schema.decodeUnknownSync(FileChanges)(await request({ method: "history.diff", checkpointId: selected.id, cursor: changes.cursor! })); setChanges({ ...page, items: [...changes.items, ...page.items] }) })}>More changed files</button> : null}
        {source ? <pre {...stylex.props(styles.pre)}>{source}</pre> : null}
        {sourcePage ? <button type="button" {...stylex.props(styles.button)} onClick={() => void act(() => readSource(sourcePage.path, sourcePage.offset, sourcePage.tree))}>Next source page</button> : null}
      </details>
      {!selected.restorable ? <p>Restoration unavailable: {selected.reason}</p> : null}
      <div {...stylex.props(styles.actions)}><button disabled={busy || !selected.restorable} type="button" {...stylex.props(styles.button)} onClick={() => void act(restore)}>Review restore</button><button disabled={busy} type="button" {...stylex.props(styles.button)} onClick={() => void act(async () => { await request({ method: "history.keep", checkpointId: selected.id, kept: !selected.kept }); setSelected({ ...selected, kept: !selected.kept }); await refresh() })}>{selected.kept ? "Stop keeping" : "Keep checkpoint"}</button></div>
    </section> : null}
  </div></section>
}

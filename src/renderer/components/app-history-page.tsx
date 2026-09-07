import type { KeyboardEvent } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
  MoreHorizontalIcon,
} from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import {
  CheckpointPage,
  CheckpointSummary,
  FileChanges,
  HistoryResponse,
  HistoryStatus,
} from "../../packages/app-history"
import type { HistoryRequest } from "../../packages/app-history"
import { useAppNavigation } from "../app-navigation"
import { CheckpointSource } from "./checkpoint-source"
import { styles } from "./app-settings.styles"

type Client = (input: HistoryRequest) => Promise<unknown>
class HistoryRequestError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "HistoryRequestError"
    this.code = code
  }
}
const decodeHistoryResponse = (raw: unknown) => {
  const response = Schema.decodeUnknownSync(HistoryResponse)(raw)
  if (!response.ok) {
    throw new HistoryRequestError(
      response.error.code,
      `${response.error.message} ${response.error.nextAction ?? ""}`,
    )
  }
  return response.value
}
const origins = {
  baseline: "Initial app",
  before_restore: "Before restore",
  customization: "Ernie customization",
  external: "External changes",
  launch: "Changes found on launch",
  manual: "Manual checkpoint",
  official_update: "Official update",
}
const checkpointDate = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
})

const closeHistoryMenu = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key === "Escape") {
    const menu = event.currentTarget.closest("details")
    if (menu) {
      menu.open = false
      menu.querySelector("summary")?.focus()
    }
  }
}

const checkpointBadge = (item: CheckpointSummary, current: boolean) => {
  if (current) {
    return "Current"
  }
  if (item.knownWorking) {
    return "Startup checked"
  }
  return item.restorable ? "Saved" : "Unavailable"
}

const CheckpointRow = ({
  item,
  busy,
  expanded,
  current,
  onToggle,
}: {
  item: CheckpointSummary
  busy: boolean
  expanded: boolean
  current: boolean
  onToggle: () => void | Promise<void>
}) => (
  <button
    disabled={busy}
    type="button"
    aria-expanded={expanded}
    aria-describedby={`checkpoint-screenshot-${item.id}`}
    aria-controls={expanded ? `checkpoint-panel-${item.id}` : undefined}
    onClick={onToggle}
    {...stylex.props(
      styles.button,
      styles.checkpointRow,
      current && styles.currentCheckpoint,
      expanded && styles.selectedCheckpoint,
    )}
  >
    <span {...stylex.props(styles.checkpointText)}>
      <span {...stylex.props(styles.checkpointTitle)}>{item.title}</span>
      <span {...stylex.props(styles.checkpointMeta)}>
        <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>
          {checkpointDate.format(new Date(item.createdAt))}
        </time>{" "}
        · {item.changedFileCount} {item.changedFileCount === 1 ? "file" : "files"} changed
      </span>
    </span>
    <span
      aria-hidden="true"
      title="No screenshot captured"
      {...stylex.props(styles.screenshotStack)}
    >
      <span {...stylex.props(styles.screenshotBack)} />
      <span {...stylex.props(styles.screenshotFront)}>
        <ImageIcon size={14} />
      </span>
    </span>
    <span id={`checkpoint-screenshot-${item.id}`} hidden>
      No screenshot captured
    </span>
    <span {...stylex.props(styles.checkpointBadge)}>{checkpointBadge(item, current)}</span>
    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
  </button>
)

interface SourcePage {
  path: string
  offset: number
  tree: string
}

const CheckpointDetails = ({
  selected,
  changes,
  source,
  sourcePage,
  act,
  readSource,
  request,
  setChanges,
}: {
  selected: CheckpointSummary
  changes: typeof FileChanges.Type | undefined
  source: string | undefined
  sourcePage: SourcePage | undefined
  act: (operation: () => Promise<void>, label?: string) => Promise<void>
  readSource: (path: string, offset?: number, expectedTree?: string) => Promise<void>
  request: (input: HistoryRequest) => Promise<unknown>
  setChanges: (changes: typeof FileChanges.Type) => void
}) => (
  <section
    tabIndex={-1}
    id={`checkpoint-panel-${selected.id}`}
    aria-label="Checkpoint details"
    {...stylex.props(styles.accordionDetail)}
  >
    <header {...stylex.props(styles.detailHeader)}>
      <h2 {...stylex.props(styles.detailTitle)}>{selected.title}</h2>
      <span {...stylex.props(styles.detailBadge, selected.complete && styles.completeBadge)}>
        {selected.complete ? "Complete" : "Incomplete"}
      </span>
    </header>
    <div {...stylex.props(styles.detailMetric)}>
      <strong {...stylex.props(styles.detailCount)}>{changes?.total ?? "…"}</strong>
      <span {...stylex.props(styles.description)}>
        {changes?.total === 1 ? "file changed" : "files changed"}
        <br />
        from the current app
      </span>
    </div>
    <dl {...stylex.props(styles.detailFacts)}>
      <div {...stylex.props(styles.detailFact)}>
        <dt>Saved</dt>
        <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
      </div>
      <div {...stylex.props(styles.detailFact)}>
        <dt>Source</dt>
        <dd>{origins[selected.origin]}</dd>
      </div>
      <div {...stylex.props(styles.detailFact)}>
        <dt>Captured files</dt>
        <dd>{selected.fileCount}</dd>
      </div>
      <div {...stylex.props(styles.detailFact)}>
        <dt>Startup</dt>
        <dd>{selected.knownWorking ? "Checked" : "Not checked"}</dd>
      </div>
    </dl>
    <details {...stylex.props(styles.technicalDetails)}>
      <summary {...stylex.props(styles.technicalSummary)}>
        <span>Technical details</span>
        <ChevronDownIcon size={16} aria-hidden="true" {...stylex.props(styles.technicalChevron)} />
      </summary>
      <p {...stylex.props(styles.description)}>Startup checks do not verify individual features.</p>
      {selected.proposedTitle ? (
        <p {...stylex.props(styles.description)}>Suggested title; it does not verify authorship.</p>
      ) : null}
      {changes?.items.map((file) => (
        <button
          key={file.path}
          type="button"
          {...stylex.props(styles.button, styles.fileRow)}
          onClick={() => act(() => readSource(file.path))}
        >
          <span {...stylex.props(styles.fileChange)}>{file.change}</span>
          <code {...stylex.props(styles.filePath)}>{file.path}</code>
          <ChevronRightIcon size={14} aria-hidden="true" />
        </button>
      ))}
      {changes?.cursor ? (
        <button
          type="button"
          {...stylex.props(styles.button)}
          onClick={() =>
            act(async () => {
              const page = Schema.decodeUnknownSync(FileChanges)(
                await request({
                  checkpointId: selected.id,
                  cursor: changes.cursor ?? undefined,
                  method: "history.diff",
                }),
              )
              setChanges({ ...page, items: [...changes.items, ...page.items] })
            })
          }
        >
          More changed files
        </button>
      ) : null}
      {source ? (
        <pre {...stylex.props(styles.pre)}>
          <CheckpointSource source={source} />
        </pre>
      ) : null}
      {sourcePage ? (
        <button
          type="button"
          {...stylex.props(styles.button)}
          onClick={() => act(() => readSource(sourcePage.path, sourcePage.offset, sourcePage.tree))}
        >
          Next source page
        </button>
      ) : null}
    </details>
    {selected.restorable ? null : <p>Restoration unavailable: {selected.reason}</p>}
  </section>
)

const HistoryStatusMessage = ({ status }: { status: typeof HistoryStatus.Type }) => {
  let message = "No unsaved changes."
  if (status.unsavedChanges === null) {
    message = "Unsaved changes could not be checked."
  } else if (status.unsavedChanges) {
    message = "Changes since last checkpoint"
  }
  return (
    <p {...stylex.props(styles.historyStatus)}>
      <output>{status.captureError?.message ?? message}</output>
    </p>
  )
}

const HistoryFeedback = ({
  message,
  notice,
  pending,
  retry,
}: {
  message?: string
  notice?: string
  pending: string | null
  retry?: () => Promise<void>
}) => (
  <div>
    {message ? <p role="alert">{message}</p> : null}
    {message && retry ? (
      <button
        type="button"
        disabled={pending !== null}
        {...stylex.props(styles.button)}
        onClick={retry}
      >
        Try again
      </button>
    ) : null}
    {notice ? (
      <p>
        <output>{notice}</output>
      </p>
    ) : null}
    {pending ? (
      <p {...stylex.props(styles.description)}>
        <output>{pending}</output>
      </p>
    ) : null}
  </div>
)

/** Full history page uses the same controller as independent recovery and agents. */
export const AppHistoryPage = ({
  client,
  embedded = false,
}: { client?: Client; embedded?: boolean } = {}) => {
  const rpc = useRpc()
  const { navigate } = useAppNavigation()
  const request = useCallback(
    async (input: HistoryRequest) =>
      decodeHistoryResponse(await (client ? client(input) : rpc.app.appHistory.request(input))),
    [client, rpc],
  )
  const [items, setItems] = useState<readonly CheckpointSummary[]>([])
  const [status, setStatus] = useState<typeof HistoryStatus.Type>()
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>()
  const selected = items.find((item) => item.id === selectedId)
  const [changes, setChanges] = useState<typeof FileChanges.Type>()
  const [sourceResult, setSourceResult] = useState<{
    text: string
    next?: { path: string; offset: number; tree: string }
  }>()
  const source = sourceResult?.text
  const sourcePage = sourceResult?.next
  const [historyError, setHistoryError] = useState<Error>()
  const unsupportedWorkspace =
    historyError instanceof HistoryRequestError && historyError.code === "unsupported_workspace"
  const errorMessage = unsupportedWorkspace ? undefined : historyError?.message
  const [notice, setNotice] = useState<string>()
  const [pending, setPending] = useState<string | null>(null)
  const busy = pending !== null
  const revision = useRef({ value: 0 })
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const [health, page] = await Promise.all([
        request({ method: "history.status" }),
        request({ method: "history.list" }),
      ])
      if (signal?.aborted) {
        return
      }
      setStatus(Schema.decodeUnknownSync(HistoryStatus)(health))
      const parsed = Schema.decodeUnknownSync(CheckpointPage)(page)
      setItems(parsed.items)
      setCursor(parsed.cursor)
    },
    [request],
  )
  useEffect(() => {
    const controller = new AbortController()
    const selectionRevision = revision.current
    const load = async () => {
      try {
        await refresh(controller.signal)
      } catch (error) {
        if (!controller.signal.aborted) {
          setHistoryError(error instanceof Error ? error : new Error("History unavailable"))
        }
      }
    }
    load()
    return () => {
      controller.abort()
      selectionRevision.value += 1
    }
  }, [refresh])
  const act = async (operation: () => Promise<void>, label = "Updating…") => {
    setPending(label)
    setHistoryError(undefined)
    setNotice(undefined)
    try {
      await operation()
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error : new Error("History could not complete this action."),
      )
    } finally {
      setPending(null)
    }
  }
  const inspect = async (item: CheckpointSummary) => {
    revision.current.value += 1
    const current = revision.current.value
    setItems((previous) =>
      previous.some((entry) => entry.id === item.id)
        ? previous.map((entry) => (entry.id === item.id ? item : entry))
        : [...previous, item],
    )
    setSelectedId(item.id)
    setChanges(undefined)
    setSourceResult(undefined)
    const diff = Schema.decodeUnknownSync(FileChanges)(
      await request({ checkpointId: item.id, method: "history.diff" }),
    )
    if (revision.current.value === current) {
      setChanges(diff)
    }
  }
  const readSource = async (path: string, offset = 0, expectedTree?: string) => {
    if (!selected) {
      return
    }
    const currentRevision = revision.current.value
    const content = await request({
      checkpointId: selected.id,
      expectedTree,
      method: "history.diff",
      offset,
      path,
    })
    const paging = Schema.decodeUnknownSync(
      Schema.Struct({
        before: Schema.NullOr(
          Schema.Struct({ nextOffset: Schema.optional(Schema.NullOr(Schema.Number)) }),
        ),
        current: Schema.NullOr(
          Schema.Struct({ nextOffset: Schema.optional(Schema.NullOr(Schema.Number)) }),
        ),
        currentTree: Schema.String,
      }),
    )(content)
    const next = paging.before?.nextOffset ?? paging.current?.nextOffset
    if (currentRevision !== revision.current.value) {
      return
    }
    setSourceResult({
      next: typeof next === "number" ? { offset: next, path, tree: paging.currentTree } : undefined,
      text: JSON.stringify(content, null, 2),
    })
  }
  return (
    <section aria-label="App history" {...stylex.props(!embedded && styles.page)}>
      <div {...stylex.props(styles.content)}>
        {embedded ? null : (
          <header {...stylex.props(styles.header)}>
            <button
              type="button"
              aria-label="Back to settings"
              onClick={() => navigate("settings")}
              {...stylex.props(styles.button)}
            >
              <ArrowLeftIcon size={18} />
            </button>
            <h1 {...stylex.props(styles.title)}>App history</h1>
          </header>
        )}
        <HistoryFeedback
          message={errorMessage}
          notice={unsupportedWorkspace ? "No app history to show." : notice}
          pending={pending}
          retry={status ? undefined : () => act(refresh, "Refreshing…")}
        />
        {status ? (
          <>
            <div {...stylex.props(styles.historyToolbar)}>
              <h2 {...stylex.props(styles.scopeTitle)}>Checkpoints</h2>
              <div {...stylex.props(styles.historyToolbarActions)}>
                <button
                  disabled={busy}
                  type="button"
                  {...stylex.props(styles.button, styles.historyPrimary)}
                  onClick={() =>
                    act(async () => {
                      await request({
                        method: "history.checkpoint",
                        requestId: crypto.randomUUID(),
                        title: "Manual checkpoint",
                      })
                      await refresh()
                      setNotice("Checkpoint saved.")
                    }, "Saving…")
                  }
                >
                  {pending === "Saving…" ? "Saving…" : "Save checkpoint"}
                </button>

                <details {...stylex.props(styles.historyMenu)}>
                  <summary
                    onKeyDown={closeHistoryMenu}
                    aria-label="History actions"
                    {...stylex.props(styles.button)}
                  >
                    <MoreHorizontalIcon size={16} />
                  </summary>
                  <div {...stylex.props(styles.historyMenuPanel)}>
                    {" "}
                    <button
                      onKeyDown={closeHistoryMenu}
                      disabled={busy}
                      type="button"
                      {...stylex.props(styles.button)}
                      onClick={() => act(refresh, "Refreshing…")}
                    >
                      {pending === "Refreshing…" ? "Refreshing…" : "Refresh"}
                    </button>
                    {status.lastRecoveryId ? (
                      <button
                        onKeyDown={closeHistoryMenu}
                        disabled={busy}
                        type="button"
                        {...stylex.props(styles.button)}
                        onClick={() =>
                          act(async () => {
                            const checkpointId = status.lastRecoveryId
                            if (!checkpointId) {
                              return
                            }
                            await inspect(
                              Schema.decodeUnknownSync(CheckpointSummary)(
                                await request({
                                  checkpointId,
                                  method: "history.inspect",
                                }),
                              ),
                            )
                          })
                        }
                      >
                        Review previous state
                      </button>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
            {items.length ? null : <p>No saved checkpoints yet.</p>}
            <ol
              aria-label="Saved checkpoints"
              {...stylex.props(styles.list, styles.checkpointList)}
            >
              {items.map((item) => (
                <li key={item.id}>
                  <CheckpointRow
                    item={item}
                    busy={busy}
                    expanded={selected?.id === item.id}
                    current={status.currentCheckpointId === item.id}
                    onToggle={() => {
                      if (selected?.id === item.id) {
                        revision.current.value += 1
                        setSelectedId(undefined)
                        return
                      }
                      return act(() => inspect(item), "Inspecting checkpoint…")
                    }}
                  />
                  {selected?.id === item.id ? (
                    <CheckpointDetails
                      selected={selected}
                      changes={changes}
                      source={source}
                      sourcePage={sourcePage}
                      act={act}
                      readSource={readSource}
                      request={request}
                      setChanges={setChanges}
                    />
                  ) : null}
                </li>
              ))}
            </ol>
            <HistoryStatusMessage status={status} />
            {cursor ? (
              <button
                type="button"
                disabled={busy}
                {...stylex.props(styles.button)}
                onClick={() =>
                  act(async () => {
                    const page = Schema.decodeUnknownSync(CheckpointPage)(
                      await request({ cursor, method: "history.list" }),
                    )
                    setItems((previous) => [...previous, ...page.items])
                    setCursor(page.cursor)
                  })
                }
              >
                Older checkpoints
              </button>
            ) : null}
          </>
        ) : null}
        {!status && !historyError ? (
          <p>
            <output>Loading app history…</output>
          </p>
        ) : null}
      </div>
    </section>
  )
}

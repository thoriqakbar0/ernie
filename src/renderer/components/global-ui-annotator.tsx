import { useCallback, useEffect, useEffectEvent, useRef, useState, useMemo } from "react"
import * as stylex from "@stylexjs/stylex"
import type { PropsWithChildren } from "react"
import { createPortal } from "react-dom"
import { useAppNavigation } from "../app-navigation"
import { annotationContext } from "./ui-annotation-context"
import type { AnnotationHost } from "./ui-annotation-context"
import type { ReactGrabAPI } from "react-grab/core"
import { UiAnnotationEditor } from "./ui-annotation-editor"
import type { UiAnnotation, UiSelection } from "./ui-annotation-editor"
import { UiAnnotationReview } from "./ui-annotation-review"
import { styles } from "./ui-annotations.styles"

const findTrigger = () =>
  [...document.querySelectorAll<HTMLButtonElement>("[data-ui-annotation-trigger]")].find(
    (element) => element.getClientRects().length > 0,
  ) ?? null

const isAnnotationShortcut = (event: KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) &&
  event.shiftKey &&
  !event.altKey &&
  event.key.toLowerCase() === "a" &&
  !event.repeat &&
  !event.isComposing

/** One lazy, local-only element selector survives workspace navigation. */
export const UiAnnotationProvider = ({ children }: PropsWithChildren) => {
  const { page } = useAppNavigation()
  const [hosts, setHosts] = useState<ReadonlyMap<string, AnnotationHost>>(new Map())
  const [editor, setEditor] = useState<{
    selection?: UiSelection
    regionId?: string
    comment: string
  }>({ comment: "" })
  const { selection, regionId, comment } = editor
  const register = useCallback((id: string, host: AnnotationHost | null) => {
    setHosts((previous) => {
      const next = new Map(previous)
      if (host) {
        next.set(id, host)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])
  const api = useRef<ReactGrabAPI | null>(null)
  const loading = useRef<Promise<ReactGrabAPI> | null>(null)
  const alive = useRef(true)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const focusAfterClose = useRef(false)
  const [active, setActive] = useState(false)
  const [notes, setNotes] = useState<readonly UiAnnotation[]>([])
  const [review, setReview] = useState(false)
  const [feedback, setFeedback] = useState("")
  const capture = useCallback(async (element: Element, engine: ReactGrabAPI) => {
    if (element.closest("[data-ui-annotator]") || element.closest("webview")) {
      setFeedback("Select Ernie’s interface. Embedded websites aren’t supported.")
      return
    }
    engine.deactivate()
    const selectedRegion = element.closest<HTMLElement>("[data-ui-annotation-region]")?.dataset
      .uiAnnotationRegion
    setReview(false)
    restoreFocus.current =
      element instanceof HTMLElement && element.tabIndex >= 0 ? element : findTrigger()
    let context = "Source context unavailable."
    try {
      context = await engine.getStackContext(element)
    } catch {
      /* Selection remains useful without source instrumentation. */
    }
    if (!alive.current) {
      return
    }
    setEditor({
      comment: "",
      regionId: selectedRegion,
      selection: {
        context,
        element:
          element.getAttribute("aria-label") ??
          element.closest("article[aria-label]")?.getAttribute("aria-label") ??
          element.querySelector("h1,h2,h3")?.textContent?.trim() ??
          element.textContent?.trim().replaceAll(/\s+/gu, " ").slice(0, 80) ??
          element.tagName.toLowerCase(),
        page: window.location.pathname + window.location.search,
      },
    })
    setFeedback("")
  }, [])
  const prepare = useCallback(() => {
    if (api.current) {
      return Promise.resolve(api.current)
    }
    if (!loading.current) {
      loading.current = (async () => {
        try {
          const { init } = await import("react-grab/core")
          const engine = init({
            activationKey: () => false,
            enabled: true,
            freezeReactUpdates: false,
            telemetry: false,
          })
          engine.registerPlugin({
            hooks: {
              onActivate: () => setActive(true),
              onDeactivate: () => setActive(false),
              onElementSelect: (element) => {
                void capture(element, engine)
                return true
              },
            },
            name: "ernie-ui-notes",
            theme: { toolbar: { enabled: false } },
          })
          if (alive.current) {
            api.current = engine
          } else {
            engine.dispose()
          }
          return engine
        } catch (error) {
          loading.current = null
          throw error
        }
      })()
    }
    return loading.current
  }, [capture])
  const activate = useCallback(
    async (focused?: HTMLElement) => {
      if (api.current?.isActive()) {
        api.current.deactivate()
        return
      }
      setFeedback("Loading selection tool…")
      try {
        const engine = await prepare()
        if (!alive.current) {
          return
        }
        setFeedback("")
        if (focused) {
          await capture(focused, engine)
        } else {
          engine.activate()
        }
      } catch {
        setFeedback("The selection tool could not load. Try again.")
      }
    },
    [capture, prepare],
  )
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isAnnotationShortcut(event)) {
      event.preventDefault()
      if (selection || review) {
        return
      }
      const focused = document.activeElement
      void activate(
        focused instanceof HTMLElement &&
          focused !== document.body &&
          !focused.closest("[data-ui-annotator]")
          ? focused
          : undefined,
      )
    }
    if (event.key === "Escape" && selection) {
      focusAfterClose.current = true
      setEditor((previous) => ({ ...previous, comment: "", selection: undefined }))
      return
    }
    if (event.key === "Escape" && review) {
      focusAfterClose.current = true
      setReview(false)
      return
    }
    if (event.key === "Escape" && api.current?.isActive()) {
      api.current.deactivate()
      findTrigger()?.focus()
    }
  })
  useEffect(() => {
    alive.current = true
    const keydown = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", keydown)
    return () => {
      alive.current = false
      window.removeEventListener("keydown", keydown)
      api.current?.dispose()
      api.current = null
      loading.current = null
    }
  }, [])
  useEffect(() => {
    if (!focusAfterClose.current || selection || review) {
      return
    }
    focusAfterClose.current = false
    const source = restoreFocus.current
    const target =
      source?.isConnected && source.getClientRects().length > 0 && !source.matches(":disabled")
        ? source
        : (findTrigger() ?? document.querySelector<HTMLElement>("#ernie-main-content"))
    target?.focus({ preventScroll: true })
  }, [review, selection])
  const selectedHost = regionId ? hosts.get(regionId) : undefined
  const visible = (host: AnnotationHost) =>
    host.page === page && host.element.isConnected && !host.element.closest("[hidden]")
  const host =
    selectedHost && visible(selectedHost)
      ? selectedHost
      : [...hosts.values()]
          .filter((candidate) => candidate.fallback > 0 && visible(candidate))
          .toSorted((left, right) => right.fallback - left.fallback)[0]
  const value = useMemo(
    () => ({
      active,
      count: notes.length,
      editing: Boolean(selection),
      feedback,
      handleActivate: () => {
        void activate()
      },
      handleToggleReview: () => {
        api.current?.deactivate()
        setReview((previous) => !previous)
      },
      register,
      review,
    }),
    [active, activate, feedback, notes.length, register, review, selection],
  )
  return (
    <annotationContext.Provider value={value}>
      {children}
      {host && (selection || review)
        ? createPortal(
            <aside aria-label="UI annotation" {...stylex.props(styles.contextual)}>
              {selection ? (
                <UiAnnotationEditor
                  selection={selection}
                  comment={comment}
                  onCommentChange={(nextComment) =>
                    setEditor((previous) => ({ ...previous, comment: nextComment }))
                  }
                  fallback={Boolean(regionId && host !== selectedHost)}
                  onClose={() => {
                    focusAfterClose.current = true
                    setEditor((previous) => ({ ...previous, comment: "", selection: undefined }))
                  }}
                  onSave={(note) => {
                    focusAfterClose.current = true
                    setNotes((previous) => [
                      ...previous,
                      { ...selection, comment: note, id: crypto.randomUUID() },
                    ])
                    setEditor((previous) => ({ ...previous, comment: "", selection: undefined }))
                  }}
                />
              ) : null}
              {review ? (
                <UiAnnotationReview
                  notes={notes}
                  onRemove={(id) =>
                    setNotes((previous) => previous.filter((note) => note.id !== id))
                  }
                />
              ) : null}
            </aside>,
            host.element,
          )
        : null}
    </annotationContext.Provider>
  )
}

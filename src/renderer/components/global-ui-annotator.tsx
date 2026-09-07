import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import { MessageSquarePlusIcon, XIcon } from "lucide-react"
import type { ReactGrabAPI } from "react-grab/core"
import { UiAnnotationEditor } from "./ui-annotation-editor"
import type { UiAnnotation, UiSelection } from "./ui-annotation-editor"
import { UiAnnotationReview } from "./ui-annotation-review"
import { styles } from "./ui-annotations.styles"

/** One lazy, local-only element selector survives workspace navigation. */
export const GlobalUiAnnotator = () => {
  const api = useRef<ReactGrabAPI | null>(null)
  const loading = useRef<Promise<ReactGrabAPI> | null>(null)
  const alive = useRef(true)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const toggle = useRef<HTMLButtonElement | null>(null)
  const [active, setActive] = useState(false)
  const [selection, setSelection] = useState<UiSelection>()
  const [notes, setNotes] = useState<readonly UiAnnotation[]>([])
  const [review, setReview] = useState(false)
  const [feedback, setFeedback] = useState("")
  const capture = useCallback(async (element: Element, engine: ReactGrabAPI) => {
    if (element.closest("[data-ui-annotator]") || element.closest("webview")) {
      setFeedback("Select Ernie’s interface. Embedded websites aren’t supported.")
      return
    }
    engine.deactivate()
    restoreFocus.current =
      element instanceof HTMLElement && element.tabIndex >= 0 ? element : toggle.current
    let context = "Source context unavailable."
    try {
      context = await engine.getStackContext(element)
    } catch {
      /* Selection remains useful without source instrumentation. */
    }
    if (!alive.current) {
      return
    }
    setSelection({
      context,
      element:
        element.getAttribute("aria-label") ??
        element.querySelector("h1,h2,h3")?.textContent?.trim() ??
        element.textContent?.trim().replaceAll(/\s+/gu, " ").slice(0, 80) ??
        element.tagName.toLowerCase(),
      page: window.location.pathname + window.location.search,
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
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "a" &&
      !event.repeat &&
      !event.isComposing
    ) {
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
    if (event.key === "Escape" && api.current?.isActive()) {
      api.current.deactivate()
      toggle.current?.focus()
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
  return (
    <>
      <div
        data-ui-annotator
        data-react-grab-ignore-events
        {...stylex.props(styles.toolbar, (Boolean(selection) || review) && styles.hidden)}
      >
        <button
          ref={toggle}
          type="button"
          aria-pressed={active}
          aria-keyshortcuts="Meta+Shift+A Control+Shift+A"
          {...stylex.props(styles.button)}
          onClick={() => {
            void activate()
          }}
        >
          {active ? (
            <XIcon size={14} aria-hidden="true" />
          ) : (
            <MessageSquarePlusIcon size={14} aria-hidden="true" />
          )}
          {active ? "Stop annotating" : "Annotate UI"}
        </button>
        {notes.length ? (
          <button
            type="button"
            {...stylex.props(styles.button)}
            onClick={() => {
              api.current?.deactivate()
              setReview(true)
            }}
          >
            UI notes · {notes.length}
          </button>
        ) : null}
        {active ? <p {...stylex.props(styles.hint)}>Select app UI · Esc to stop</p> : null}
        <output {...stylex.props(styles.hint)}>{feedback}</output>
      </div>
      {selection ? (
        <UiAnnotationEditor
          selection={selection}
          finalFocus={() =>
            restoreFocus.current?.isConnected ? restoreFocus.current : toggle.current
          }
          onClose={() => setSelection(undefined)}
          onSave={(comment) => {
            setNotes((previous) => [
              ...previous,
              { ...selection, comment, id: crypto.randomUUID() },
            ])
            setSelection(undefined)
          }}
        />
      ) : null}
      {review ? (
        <UiAnnotationReview
          notes={notes}
          onClose={() => setReview(false)}
          onRemove={(id) => setNotes((previous) => previous.filter((note) => note.id !== id))}
        />
      ) : null}
    </>
  )
}

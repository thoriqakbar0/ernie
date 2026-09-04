import { ArrowDownIcon } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"

import * as stylex from "@stylexjs/stylex"
import { withClassName } from "@/lib/stylex"
import { styles } from "./message-scroller.stylex"
import { Button } from "@/components/ui/button"

type ScrollBehavior = "auto" | "smooth"

type MessageScrollerContextValue = Readonly<{
  atEnd: boolean
  contentRef: React.RefObject<HTMLDivElement | null>
  scrollToEnd: (behavior?: ScrollBehavior) => void
  viewportRef: React.RefObject<HTMLDivElement | null>
}>

const MessageScrollerContext = createContext<MessageScrollerContextValue | null>(null)

function useMessageScroller() {
  const context = useContext(MessageScrollerContext)
  if (!context) throw new Error("MessageScroller components require MessageScrollerProvider")
  return context
}

function MessageScrollerProvider({ children }: Readonly<{ children: ReactNode }>) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedToEndRef = useRef(true)
  const [atEnd, setAtEnd] = useState(true)

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTo({ behavior, top: viewport.scrollHeight })
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const updatePosition = () => {
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const nextAtEnd = remaining <= 2
      pinnedToEndRef.current = nextAtEnd
      setAtEnd(nextAtEnd)
    }
    const resizeObserver = new ResizeObserver(() => {
      if (pinnedToEndRef.current) scrollToEnd("auto")
      updatePosition()
    })

    resizeObserver.observe(viewport)
    resizeObserver.observe(content)
    viewport.addEventListener("scroll", updatePosition, { passive: true })
    scrollToEnd("auto")
    updatePosition()

    return () => {
      resizeObserver.disconnect()
      viewport.removeEventListener("scroll", updatePosition)
    }
  }, [scrollToEnd])

  const value = useMemo(
    () => ({ atEnd, contentRef, scrollToEnd, viewportRef }),
    [atEnd, scrollToEnd],
  )

  return <MessageScrollerContext value={value}>{children}</MessageScrollerContext>
}

function MessageScroller({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={withClassName(stylex.props(styles.root).className, className)} {...props} />
  )
}

function MessageScrollerViewport({ className, ...props }: ComponentProps<"div">) {
  const { viewportRef } = useMessageScroller()
  return (
    <div
      className={withClassName(stylex.props(styles.viewport).className, className)}
      ref={viewportRef}
      {...props}
    />
  )
}

function MessageScrollerContent({ className, ...props }: ComponentProps<"div">) {
  const { contentRef } = useMessageScroller()
  return (
    <div
      className={withClassName(stylex.props(styles.content).className, className)}
      ref={contentRef}
      {...props}
    />
  )
}

function MessageScrollerItem(props: ComponentProps<"div">) {
  return <div {...props} />
}

function MessageScrollerButton({ className, xstyle, ...props }: ComponentProps<typeof Button>) {
  const { atEnd, scrollToEnd } = useMessageScroller()
  if (atEnd) return null

  return (
    <Button
      aria-label="Scroll to latest message"
      className={className}
      xstyle={[styles.button, xstyle]}
      onClick={() => scrollToEnd()}
      size="icon-sm"
      type="button"
      variant="secondary"
      {...props}
    >
      <ArrowDownIcon />
    </Button>
  )
}

export {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
}

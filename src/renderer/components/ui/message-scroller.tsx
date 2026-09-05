import { ArrowDownIcon } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import * as stylex from "@stylexjs/stylex"
import { controlStyles, type StyledProps } from "./styles"
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
type ReadingPosition = Readonly<{ top: number; atEnd: boolean }>
const ReadingPositions = createContext<Map<string, ReadingPosition> | undefined>(undefined)
/** Keeps reading position for the application lifetime, independently of transcript remounts. */
export function MessageReadingProvider({ children }: { children: ReactNode }) {
  const [positions] = useState(() => new Map<string, ReadingPosition>())
  return <ReadingPositions.Provider value={positions}>{children}</ReadingPositions.Provider>
}
function MessageScrollerProvider({
  children,
  restorationKey,
}: Readonly<{
  children: ReactNode
  restorationKey?: string
}>) {
  const positions = useContext(ReadingPositions)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedToEndRef = useRef(true)
  const [atEnd, setAtEnd] = useState(true)
  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : behavior,
      top: viewport.scrollHeight,
    })
  }, [])
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const updatePosition = () => {
      if (viewport.clientHeight === 0) return
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const nextAtEnd = remaining <= 2
      pinnedToEndRef.current = nextAtEnd
      setAtEnd(nextAtEnd)
      if (restorationKey) positions?.set(restorationKey, { top: viewport.scrollTop, atEnd: nextAtEnd })
    }
    const resizeObserver = new ResizeObserver(() => {
      if (viewport.clientHeight === 0) return
      if (pinnedToEndRef.current) scrollToEnd("auto")
      updatePosition()
    })
    resizeObserver.observe(viewport)
    resizeObserver.observe(content)
    viewport.addEventListener("scroll", updatePosition, {
      passive: true,
    })
    const saved = restorationKey ? positions?.get(restorationKey) : undefined
    if (saved && !saved.atEnd) viewport.scrollTop = saved.top
    else scrollToEnd("auto")
    updatePosition()
    return () => {
      resizeObserver.disconnect()
      viewport.removeEventListener("scroll", updatePosition)
    }
  }, [scrollToEnd, positions, restorationKey])
  const value = useMemo(
    () => ({
      atEnd,
      contentRef,
      scrollToEnd,
      viewportRef,
    }),
    [atEnd, scrollToEnd],
  )
  return <MessageScrollerContext value={value}>{children}</MessageScrollerContext>
}
function MessageScroller({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) {
  return <div {...stylex.props(styles.MessageScroller, xstyle)} {...props} />
}
function MessageScrollerViewport({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) {
  const { viewportRef } = useMessageScroller()
  return (
    <div {...stylex.props(styles.MessageScrollerViewport, xstyle)} ref={viewportRef} {...props} />
  )
}
function MessageScrollerContent({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) {
  const { contentRef } = useMessageScroller()
  return (
    <div {...stylex.props(styles.MessageScrollerContent, xstyle)} ref={contentRef} {...props} />
  )
}
function MessageScrollerItem(props: StyledProps<ComponentProps<"div">>) {
  return <div {...props} />
}
function MessageScrollerButton({ xstyle, ...props }: ComponentProps<typeof Button>) {
  const { atEnd, scrollToEnd } = useMessageScroller()
  if (atEnd) return null
  return (
    <Button
      aria-label="Scroll to latest message"
      xstyle={[styles.MessageScrollerButton, xstyle]}
      onClick={() => scrollToEnd()}
      size="icon-sm"
      type="button"
      variant="secondary"
      {...props}
    >
      <ArrowDownIcon {...stylex.props(controlStyles.icon)} />
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
const styles = stylex.create({
  MessageScroller: {
    position: "relative",
    display: "flex",
    width: "100%",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
  },
  MessageScrollerViewport: {
    width: "100%",
    height: "100%",
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  MessageScrollerContent: {
    display: "flex",
    flexDirection: "column",
  },
  MessageScrollerButton: {
    position: "absolute",
    bottom: 16,
    left: "50%",
    zIndex: 10,
    transform: "translateX(-50%)",
    borderRadius: 9999,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  },
})

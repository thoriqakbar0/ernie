import { ArrowDownIcon } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ComponentProps, ReactNode } from "react"
import * as stylex from "@stylexjs/stylex"
import { controlStyles } from "./styles"
import type { StyledProps } from "./styles"
import { Button } from "@/components/ui/button"

type ScrollBehavior = "auto" | "smooth"
type MessageScrollerContextValue = Readonly<{
  atEnd: boolean
  contentRef: React.RefObject<HTMLDivElement | null>
  scrollToEnd: (behavior?: ScrollBehavior) => void
  viewportRef: React.RefObject<HTMLDivElement | null>
}>
const MessageScrollerContext = createContext<MessageScrollerContextValue | null>(null)
const useMessageScroller = () => {
  const context = useContext(MessageScrollerContext)
  if (!context) {
    throw new Error("MessageScroller components require MessageScrollerProvider")
  }
  return context
}
type ReadingPosition = Readonly<{ top: number; atEnd: boolean }>
const ReadingPositions = createContext<Map<string, ReadingPosition> | undefined>(undefined)
/** Keeps reading position for the application lifetime, independently of transcript remounts. */
export const MessageReadingProvider = ({ children }: { children: ReactNode }) => {
  const [positions, setPositions] = useState(() => new Map<string, ReadingPosition>())
  void setPositions
  return <ReadingPositions.Provider value={positions}>{children}</ReadingPositions.Provider>
}
const MessageScrollerProvider = ({
  children,
  restorationKey,
}: Readonly<{
  children: ReactNode
  restorationKey?: string
}>) => {
  const positions = useContext(ReadingPositions)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedToEndRef = useRef(true)
  const [atEnd, setAtEnd] = useState(true)
  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    viewport.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : behavior,
      top: viewport.scrollHeight,
    })
  }, [])
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) {
      return
    }
    const updatePosition = () => {
      if (viewport.clientHeight === 0) {
        return
      }
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      const nextAtEnd = remaining <= 2
      pinnedToEndRef.current = nextAtEnd
      setAtEnd(nextAtEnd)
      if (restorationKey) {
        positions?.set(restorationKey, { atEnd: nextAtEnd, top: viewport.scrollTop })
      }
    }
    const resizeObserver = new ResizeObserver(() => {
      if (viewport.clientHeight === 0) {
        return
      }
      if (pinnedToEndRef.current) {
        scrollToEnd("auto")
      }
      updatePosition()
    })
    resizeObserver.observe(viewport)
    resizeObserver.observe(content)
    viewport.addEventListener("scroll", updatePosition, {
      passive: true,
    })
    const saved = restorationKey ? positions?.get(restorationKey) : undefined
    if (saved && !saved.atEnd) {
      viewport.scrollTop = saved.top
    } else {
      scrollToEnd("auto")
    }
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
const styles = stylex.create({
  MessageScroller: {
    display: "flex",
    height: "100%",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  MessageScrollerButton: {
    borderRadius: 9999,
    bottom: 16,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    left: "50%",
    position: "absolute",
    transform: "translateX(-50%)",
    zIndex: 10,
  },
  MessageScrollerContent: {
    display: "flex",
    flexDirection: "column",
  },
  MessageScrollerViewport: {
    height: "100%",
    overflowY: "auto",
    overscrollBehavior: "contain",
    width: "100%",
  },
})
const MessageScroller = ({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) => (
  <div {...stylex.props(styles.MessageScroller, xstyle)} {...props} />
)
const MessageScrollerViewport = ({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) => {
  const { viewportRef } = useMessageScroller()
  return (
    <div {...stylex.props(styles.MessageScrollerViewport, xstyle)} ref={viewportRef} {...props} />
  )
}
const MessageScrollerContent = ({ xstyle, ...props }: StyledProps<ComponentProps<"div">>) => {
  const { contentRef } = useMessageScroller()
  return (
    <div {...stylex.props(styles.MessageScrollerContent, xstyle)} ref={contentRef} {...props} />
  )
}
const MessageScrollerItem = (props: StyledProps<ComponentProps<"div">>) => <div {...props} />
const MessageScrollerButton = ({ xstyle, ...props }: ComponentProps<typeof Button>) => {
  const { atEnd, scrollToEnd } = useMessageScroller()
  if (atEnd) {
    return null
  }
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

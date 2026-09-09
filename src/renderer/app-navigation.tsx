import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import type { ReactNode } from "react"

export type ChildChat = Readonly<{
  parentId: string
  childId: string
  name: string
  parentName: string
}>

type AppPage = "conversation" | "settings" | "history"
const context = createContext<{
  childChat: ChildChat | null
  openChildChat: (child: ChildChat) => void
  page: AppPage
  navigate: (page: AppPage) => void
} | null>(null)
const readPage = (): AppPage => {
  const page = new URLSearchParams(window.location.search).get("page")
  return page === "settings" || page === "history" ? page : "conversation"
}
/** Top-level pages preserve conversation state while settings and history are open. */
export const AppNavigationProvider = ({ children }: { children: ReactNode }) => {
  const [childChat, setChildChat] = useState<ChildChat | null>(null)
  const [page, setPage] = useState<AppPage>(readPage)
  const lastHandledPage = useRef<AppPage | null>(null)
  const navigate = useCallback((next: AppPage) => {
    if (next === "conversation") setChildChat(null)
    const url = new URL(window.location.href)
    if (next === "conversation") {
      url.searchParams.delete("page")
    } else {
      url.searchParams.set("page", next)
    }
    window.history.pushState(null, "", url)
    setPage(next)
  }, [])
  useEffect(() => {
    const onPopState = () => setPage(readPage())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])
  useEffect(() => {
    if (lastHandledPage.current === page) {
      return
    }
    lastHandledPage.current = page
    if (document.activeElement?.getAttribute("role") === "tab") {
      return
    }
    document.querySelector<HTMLElement>("#ernie-main-content")?.focus({ preventScroll: true })
  })
  const openChildChat = useCallback(
    (child: ChildChat) => {
      navigate("conversation")
      setChildChat(child)
    },
    [navigate],
  )
  const value = useMemo(
    () => ({ navigate, page, childChat, openChildChat }),
    [navigate, page, childChat, openChildChat],
  )
  return <context.Provider value={value}>{children}</context.Provider>
}
export const useAppNavigation = () => {
  const navigation = useContext(context)
  if (!navigation) {
    throw new Error("AppNavigationProvider is missing")
  }
  return navigation
}

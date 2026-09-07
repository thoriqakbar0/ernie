import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"

type AppPage = "conversation" | "settings" | "history"
const context = createContext<{ page: AppPage; navigate: (page: AppPage) => void } | null>(null)
/** Top-level pages preserve conversation state while settings and history are open. */
export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const readPage = (): AppPage => {
    const page = new URLSearchParams(window.location.search).get("page")
    return page === "settings" || page === "history" ? page : "conversation"
  }
  const [page, setPage] = useState<AppPage>(readPage)
  const navigate = useCallback((next: AppPage) => {
    const url = new URL(window.location.href)
    if (next === "conversation") url.searchParams.delete("page")
    else url.searchParams.set("page", next)
    window.history.pushState(null, "", url)
    setPage(next)
  }, [])
  useEffect(() => {
    const onPopState = () => setPage(readPage())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])
  useEffect(() => {
    if (document.activeElement?.getAttribute("role") === "tab") return
    document.getElementById("ernie-main-content")?.focus({ preventScroll: true })
  }, [page])
  return <context.Provider value={{ page, navigate }}>{children}</context.Provider>
}
export function useAppNavigation() {
  const navigation = useContext(context)
  if (!navigation) throw new Error("AppNavigationProvider is missing")
  return navigation
}

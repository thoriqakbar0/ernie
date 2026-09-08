import { useSyncExternalStore } from "react"

const active = () => {
  if (!import.meta.env.DEV) return false
  const toolbar = document.querySelector("[data-agentation-toolbar]")
  return Boolean(toolbar && !toolbar.querySelector('[title="Start feedback mode"]'))
}
const subscribe = (notify: () => void) => {
  if (!import.meta.env.DEV) return () => {}
  const observer = new MutationObserver(notify)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title"],
  })
  return () => observer.disconnect()
}

/** Reads the installed Agentation toolbar state so annotation can reach modal content. */
export const useAgentationActive = () => useSyncExternalStore(subscribe, active, () => false)

import { useEffect } from "react"
import { useAgentCreation } from "../agent-creation"
import { useAppNavigation } from "../app-navigation"
import { useAgents } from "../agent-state"
import { usePrimeSessionSelection, usePrimeSessionSnapshot } from "../prime-agent-state"

const isEditableTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.matches("input, textarea, select, [contenteditable='true']") ||
    Boolean(target.closest("input, textarea, select, [contenteditable='true']")))

const isWithinWorkspace = (target: EventTarget | null) =>
  target instanceof Node && Boolean(document.querySelector("#ernie-workspace")?.contains(target))

/** Handles application keyboard navigation without consuming text-editing or IME keystrokes. */
export const AppShortcuts = () => {
  const { setAdding } = useAgentCreation()
  const { childChat, navigate, openChildChat } = useAppNavigation()
  const { client, execute, roster } = useAgents()
  const { selectedSessionId } = usePrimeSessionSelection()
  const parentId = childChat?.parentId ?? selectedSessionId
  const snapshot = usePrimeSessionSnapshot(parentId)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        isEditableTarget(event.target)
      ) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === "n") {
        event.preventDefault()
        event.stopPropagation()
        setAdding(true)
        navigate("conversation")
        return
      }
      if ((key !== "[" && key !== "]") || !isWithinWorkspace(event.target)) {
        return
      }

      const children = snapshot.data?.useful.children ?? []
      if (!parentId || !children.length) {
        return
      }
      const currentIndex = childChat?.parentId === parentId
        ? children.findIndex((child) => child.id === childChat.childId)
        : key === "]"
          ? -1
          : children.length
      const nextIndex = (currentIndex + (key === "]" ? 1 : -1) + children.length) % children.length
      const child = children[nextIndex]
      const parentAgent = roster.agents.find((agent) => agent.root?.sessionId === parentId)
      if (!child || !parentAgent) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      void (async () => {
        const result = await execute(() => client.select({ agentId: parentAgent.id }))
        if (!result.ok) {
          return
        }
        openChildChat({
          parentId,
          parentName: parentAgent.name,
          childId: child.id,
          name: child.sessionName ?? child.label,
        })
      })()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [childChat, client, execute, navigate, openChildChat, parentId, roster.agents, setAdding, snapshot.data])

  return null
}

import { DialRoot, useDialKit } from "dialkit"
import { useEffect } from "react"
import "dialkit/styles.css"

/** One development panel owns subagent layout controls. */
export const ExecutionDials = () => {
  const values = useDialKit("Subagent chats", {
    topGap: [0, 0, 20],
    toggleInset: [62, 0, 100],
    listInset: [30, 0, 80],
    chevronGap: [2, 0, 16],
  })
  useEffect(() => {
    const style = document.documentElement.style
    const entries = [
      ["--subagent-top-gap", values.topGap],
      ["--subagent-toggle-inset", values.toggleInset],
      ["--subagent-list-inset", values.listInset],
      ["--subagent-chevron-gap", values.chevronGap],
    ] as const
    for (const [key, value] of entries) style.setProperty(key, `${value}px`)
    return () => { for (const [key] of entries) style.removeProperty(key) }
  }, [values.topGap, values.toggleInset, values.listInset, values.chevronGap])
  return <DialRoot position="top-right" defaultOpen />
}

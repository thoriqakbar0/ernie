import { useDialKit } from "dialkit"
import { AnimatedTabs } from "./ui/animated-tabs"
import type { AnimatedTabsProps } from "./ui/animated-tabs"

/** Development-only radius controls preserve the tab behavior and fixed production shapes. */
export const AgentSettingsTabsTuning = (props: AnimatedTabsProps) => {
  const radii = useDialKit("Agent settings tabs", {
    indicator: [8, 0, 32, 1],
    list: [12, 0, 32, 1],
    tab: [8, 0, 32, 1],
  })
  return (
    <AnimatedTabs {...props} radii={radii} />
  )
}

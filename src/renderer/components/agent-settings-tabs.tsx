import { lazy, Suspense } from "react"
import { AnimatedTabs } from "./ui/animated-tabs"
import type { AnimatedTabsProps } from "./ui/animated-tabs"

const DevelopmentTabs = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("./agent-settings-tabs-tuning")
      return { default: module.AgentSettingsTabsTuning }
    })
  : null

/** Keeps live radius tuning scoped to Agent settings and out of production imports. */
export const AgentSettingsTabs = (props: AnimatedTabsProps) =>
  DevelopmentTabs ? (
    <Suspense fallback={<AnimatedTabs {...props} />}>
      <DevelopmentTabs {...props} />
    </Suspense>
  ) : (
    <AnimatedTabs {...props} />
  )

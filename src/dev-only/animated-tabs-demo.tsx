import { AnimatedTabs } from "../renderer/components/ui/animated-tabs"

/** Standalone demonstration of label-based animated tab selection. */
export const Demo = () => (
  <AnimatedTabs
    tabs={[
      { label: "Home" },
      { label: "About" },
      { label: "Resources" },
      { label: "Docs" },
      { label: "Support" },
    ]}
  />
)

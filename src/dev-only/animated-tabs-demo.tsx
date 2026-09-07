import { AnimatedTabs } from "../renderer/components/ui/animated-tabs"

/** Standalone demonstration of label-based animated tab selection. */
export function Demo() {
  return <AnimatedTabs tabs={[{ label: "Home" }, { label: "About" }, { label: "Resources" }, { label: "Docs" }, { label: "Support" }]}/>
}

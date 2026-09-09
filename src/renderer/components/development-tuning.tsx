import { DialRoot, useDialKit } from "dialkit"
import "dialkit/styles.css"
import { useEffect } from "react"

/** Owns the development tuning panel and the transcript's existing width variable. */
export const DevelopmentTuning = () => {
  const { width } = useDialKit("Message scroller", {
    width: [848, 360, 1600, 8],
  })
  useEffect(() => {
    const style = document.documentElement.style
    const previous = style.getPropertyValue("--transcript-width")
    style.setProperty("--transcript-width", `${width}px`)
    return () => {
      if (previous) {
        style.setProperty("--transcript-width", previous)
      } else {
        style.removeProperty("--transcript-width")
      }
    }
  }, [width])
  return <DialRoot position="bottom-left" defaultOpen />
}

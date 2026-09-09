import { Globe2Icon } from "lucide-react"
import { useBrowserControls } from "../browser-controls"
import { BrowserButton } from "./browser-button"

/** A header action opens or hides the window browser and supplies its focus-return target. */
export const BrowserToggle = () => {
  const browser = useBrowserControls()
  return browser ? (
    <BrowserButton
      label={browser.open ? "Hide browser" : "Open browser"}
      icon={Globe2Icon}
      expanded={browser.open}
      controls="ernie-browser"
      shortcut="Meta+Alt+B"
      onClick={(event) => browser.toggle(event.currentTarget)}
    />
  ) : null
}

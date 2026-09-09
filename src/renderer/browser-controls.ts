import { createContext, useContext } from "react"

interface BrowserControls {
  open: boolean
  toggle: (opener: HTMLButtonElement) => void
}

/** Header controls address the existing window-owned browser without owning its tabs. */
export const BrowserControlsContext = createContext<BrowserControls | undefined>(undefined)

/** Returns the browser controls when mounted inside the persistent workspace. */
export const useBrowserControls = () => useContext(BrowserControlsContext)

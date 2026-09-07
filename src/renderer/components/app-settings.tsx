import { SettingsIcon } from "lucide-react"
import * as stylex from "@stylexjs/stylex"
import { useAppNavigation } from "../app-navigation"
import { styles } from "./app-settings.styles"

/** Sidebar entry opens a full settings page without replacing the conversation. */
export const AppSettings = () => {
  const { navigate, page } = useAppNavigation()
  return (
    <button
      type="button"
      aria-current={page === "settings" ? "page" : undefined}
      onClick={() => navigate("settings")}
      {...stylex.props(styles.trigger)}
    >
      <SettingsIcon size={16} aria-hidden="true" />
      Settings
    </button>
  )
}

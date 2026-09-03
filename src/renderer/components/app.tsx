import * as stylex from "@stylexjs/stylex"
import { styles } from "./app.stylex"
import { Agentation } from "agentation"
import { View } from "@zenbujs/core/react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import { ChatWorkspace } from "./chat-workspace"
import { Titlebar } from "./titlebar"

export function App() {
  return (
    <div {...stylex.props(styles.flex, styles.minHScreen, styles.flexCol, styles.bgZinc50, styles.textZinc950, styles.darkBgZinc950, styles.darkTextZinc50)}>
      <Titlebar />
      <main {...stylex.props(styles.grid, styles.minH0, styles.flex1, styles.appColumns)}>
        <aside aria-label="Sidebar" {...stylex.props(styles.minH0)}>
          <View {...stylex.props(styles.hFull, styles.wFull)} name={SIDEBAR_VIEW_TYPE} />
        </aside>
        <ChatWorkspace />
      </main>
      {import.meta.env.DEV && import.meta.env.VITE_ERNIE_CYPRESS !== "1"
        ? <Agentation endpoint="http://127.0.0.1:4747" />
        : null}
    </div>
  )
}

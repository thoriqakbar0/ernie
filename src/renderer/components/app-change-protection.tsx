import { useEffect, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import * as stylex from "@stylexjs/stylex"
import { HistoryResponse } from "../../packages/app-history"
import { useAppNavigation } from "../app-navigation"
import { styles } from "./app-settings.styles"

const protection = Schema.Struct({
  captureError: Schema.NullOr(Schema.Unknown),
  recoveryAvailable: Schema.Boolean,
  workspace: Schema.String,
})
/** A protection claim requires a responding host with capture and independent recovery. */
export const AppChangeProtection = ({ workspace }: { workspace: string; working: boolean }) => {
  const rpc = useRpc()
  const { navigate } = useAppNavigation()
  const [protectedChanges, setProtectedChanges] = useState(false)
  useEffect(() => {
    let live = true
    const checkProtection = async () => {
      try {
        const raw = await rpc.app.appHistory.request({ method: "history.status" })
        const result = Schema.decodeUnknownSync(HistoryResponse)(raw)
        const status = result.ok ? Schema.decodeUnknownSync(protection)(result.value) : undefined
        if (live) {
          setProtectedChanges(
            Boolean(
              status?.recoveryAvailable && !status.captureError && status.workspace === workspace,
            ),
          )
        }
      } catch {
        if (live) {
          setProtectedChanges(false)
        }
      }
    }
    void checkProtection()
    return () => {
      live = false
    }
  }, [rpc, workspace])
  return (
    <button
      type="button"
      onClick={() => navigate("history")}
      {...stylex.props(styles.button, styles.description)}
    >
      {protectedChanges ? "App changes protected" : "Check app history before editing"}
    </button>
  )
}

import { useEffect, useState } from "react"
import { useRpc } from "@zenbujs/core/react"
import { Schema } from "effect"
import * as stylex from "@stylexjs/stylex"
import { HistoryResponse } from "../../packages/app-history"
import { useAppNavigation } from "../app-navigation"
import { styles } from "./app-settings.styles"

const protection = Schema.Struct({ workspace: Schema.String, recoveryAvailable: Schema.Boolean, captureError: Schema.NullOr(Schema.Unknown) })
/** A protection claim requires a responding host with capture and independent recovery. */
export function AppChangeProtection({ workspace, working }: { workspace: string; working: boolean }) {
  const rpc = useRpc()
  const { navigate } = useAppNavigation()
  const [protectedChanges, setProtectedChanges] = useState(false)
  useEffect(() => {
    let live = true
    void rpc.app.appHistory.request({ method: "history.status" }).then(raw => {
      const result = Schema.decodeUnknownSync(HistoryResponse)(raw)
      const status = result.ok ? Schema.decodeUnknownSync(protection)(result.value) : undefined
      if (live) setProtectedChanges(Boolean(status?.recoveryAvailable && !status.captureError && status.workspace === workspace))
    }).catch(() => { if (live) setProtectedChanges(false) })
    return () => { live = false }
  }, [rpc, workspace, working])
  return <button type="button" onClick={() => navigate("history")} {...stylex.props(styles.button, styles.description)}>{protectedChanges ? "App changes protected" : "Check app history before editing"}</button>
}

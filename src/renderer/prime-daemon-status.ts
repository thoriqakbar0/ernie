import type { PrimeDaemonConnection } from "../packages/prime-agent"

/** Presents the shared daemon state consistently in the sidebar and runtime footer. */
export const describePrimeDaemonConnection = (state: PrimeDaemonConnection["state"]) => {
  switch (state.status) {
    case "connected": {
      return { busy: false, label: "Connected to Prime Agent", message: `Daemon ${state.version}` }
    }
    case "connecting": {
      return {
        busy: true,
        label: "Connecting to Prime Agent…",
        message: `Connection attempt ${state.attempt} of 3.`,
      }
    }
    case "starting": {
      return {
        busy: true,
        label: "Starting Prime Agent…",
        message: "Starting your installed daemon. This can take up to 30 seconds.",
      }
    }
    case "disconnected": {
      return {
        busy: false,
        label: "Prime Agent is disconnected",
        message: "Retry to connect or start your installed Prime Agent daemon.",
      }
    }
    case "not-installed": {
      return { busy: false, label: "Prime Agent is not installed", message: state.error }
    }
    case "incompatible": {
      return { busy: false, label: "Prime Agent is incompatible", message: state.error }
    }
    case "failed": {
      return { busy: false, label: "Prime Agent could not start", message: state.error }
    }
    case "unavailable": {
      return { busy: false, label: "Prime Agent is unavailable", message: state.error }
    }
    default: {
      const exhaustive: never = state
      throw new Error("Unrecognized daemon connection state", { cause: exhaustive })
    }
  }
}

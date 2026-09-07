import { setTimeout as delay } from "node:timers/promises"

/** Owns the cancellable delay between Prime Agent recovery attempts. */
class PrimeAgentRecoveryRetry {
  private readonly delayMs: number
  private controller: AbortController | undefined
  private waiting: Promise<void> | undefined

  constructor(delayMs: number) {
    this.delayMs = delayMs
  }

  /** Reports whether one retry delay is active. */
  get pending() {
    return this.waiting !== undefined
  }

  /** Returns the single shared delay before the next recovery attempt. */
  wait() {
    if (this.waiting) {
      return this.waiting
    }
    const controller = new AbortController()
    this.controller = controller
    this.waiting = this.waitForDelay(controller)
    return this.waiting
  }

  /** Cancels and settles the active delay during recovery or disposal. */
  clear() {
    this.controller?.abort()
    this.controller = undefined
    this.waiting = undefined
  }

  private async waitForDelay(controller: AbortController) {
    try {
      await delay(this.delayMs, undefined, { signal: controller.signal })
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error
      }
    } finally {
      // A cancelled delay must not clear a newer wait.
      if (this.controller === controller) {
        this.controller = undefined
        this.waiting = undefined
      }
    }
  }
}

/** Creates the production retry delay backed by a cancellable timer. */
export const createPrimeAgentRecoveryRetry = (delayMs: number) =>
  new PrimeAgentRecoveryRetry(delayMs)

type RunPrimeAgentRecoveryLoopOptions = Readonly<{
  attempt: () => Promise<boolean>
  shouldStop: () => boolean
  wait: () => Promise<void>
}>

// @lat: [[runtime#Prime Agent runtime#External recovery]]
/** Repeats one Prime Agent recovery attempt until it succeeds or the owner stops. */
export const runPrimeAgentRecoveryLoop = async ({
  attempt,
  shouldStop,
  wait,
}: RunPrimeAgentRecoveryLoopOptions): Promise<void> => {
  if (shouldStop() || (await attempt()) || shouldStop()) {
    return
  }
  await wait()
  return runPrimeAgentRecoveryLoop({ attempt, shouldStop, wait })
}

type CancelRecoveryRetry = () => void

type ScheduleRecoveryRetry = (callback: () => void) => CancelRecoveryRetry

/** Owns the cancellable delay between Prime Agent recovery attempts. */
export class PrimeAgentRecoveryRetry {
  private cancel: CancelRecoveryRetry | undefined
  private waiting: Promise<void> | undefined
  private resolveWaiting: (() => void) | undefined

  constructor(private readonly scheduleRetry: ScheduleRecoveryRetry) {}

  /** Reports whether one retry delay is active. */
  get pending() {
    return this.waiting !== undefined
  }

  /** Returns the single shared delay before the next recovery attempt. */
  wait() {
    if (this.waiting) return this.waiting
    this.waiting = new Promise<void>((resolve) => {
      this.resolveWaiting = resolve
      this.cancel = this.scheduleRetry(() => this.finish())
    })
    return this.waiting
  }

  /** Cancels and settles the active delay during recovery or disposal. */
  clear() {
    this.cancel?.()
    this.finish()
  }

  private finish() {
    const resolve = this.resolveWaiting
    this.cancel = undefined
    this.waiting = undefined
    this.resolveWaiting = undefined
    resolve?.()
  }
}

/** Creates the production retry delay backed by a cancellable timer. */
export function createPrimeAgentRecoveryRetry(delayMs: number) {
  return new PrimeAgentRecoveryRetry((callback) => {
    const timer = setTimeout(callback, delayMs)
    return () => clearTimeout(timer)
  })
}

type RunPrimeAgentRecoveryLoopOptions = Readonly<{
  attempt: () => Promise<boolean>
  shouldStop: () => boolean
  wait: () => Promise<void>
}>

/** Repeats one Prime Agent recovery attempt until it succeeds or the owner stops. */
export async function runPrimeAgentRecoveryLoop({
  attempt,
  shouldStop,
  wait,
}: RunPrimeAgentRecoveryLoopOptions) {
  while (!shouldStop()) {
    if (await attempt()) return
    if (shouldStop()) return
    await wait()
  }
}

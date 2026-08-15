/** Cleanup for one successfully acquired effect. */
export type EffectCleanup = () => void | Promise<void>;

/** A value acquired together with the cleanup that owns its lifetime. */
export interface EffectAcquisition<Value> {
  readonly value: Value;
  readonly cleanup: EffectCleanup;
}

/** Setup that either acquires one value with cleanup or fails before ownership transfers. */
export type EffectSetup<Value> = () =>
  | EffectAcquisition<Value>
  | Promise<EffectAcquisition<Value>>;

/** The lifecycle phase of one effect scope. */
export type EffectScopeStatus = 'open' | 'closed' | 'draining' | 'drained';

/** An effect was requested after its owning scope stopped accepting acquisitions. */
export class EffectScopeClosedError extends Error {
  readonly _tag = 'EffectScopeClosedError';

  constructor(cause?: unknown) {
    super(
      'The effect scope no longer accepts acquisitions.',
      cause === undefined ? undefined : { cause },
    );
  }
}

/** One cleanup failed while the scope continued draining older effects. */
export class EffectCleanupError extends Error {
  readonly _tag = 'EffectCleanupError';

  constructor(
    readonly sequence: number,
    cause: unknown,
  ) {
    super(`Effect cleanup ${sequence} failed.`, { cause });
  }
}

/** Owns effects acquired during one bounded lifecycle attempt. */
export interface EffectScope {
  /** Report whether this scope still accepts work or is closing. */
  readonly status: EffectScopeStatus;

  /**
   * Acquire one value and arm its cleanup immediately after setup succeeds.
   *
   * Setup must reverse its own partial work before throwing.
   *
   * @throws EffectScopeClosedError when the scope closes before ownership transfers.
   */
  acquire<Value>(setup: EffectSetup<Value>): Promise<Value>;

  /** Stop accepting acquisitions while retaining armed cleanup until drain. */
  close(): void;

  /** Consume every armed cleanup once and invoke it sequentially in reverse order. */
  drain(): Promise<readonly EffectCleanupError[]>;
}

type ArmedEffect = Readonly<{
  sequence: number;
  cleanup: EffectCleanup;
}>;

/** Create an empty effect scope for one lifecycle attempt. */
export function createEffectScope(): EffectScope {
  let status: EffectScopeStatus = 'open';
  let nextSequence = 1;
  const armedEffects: ArmedEffect[] = [];
  const acquisitionSettlements: Promise<EffectCleanupError | null>[] = [];
  let drainPromise: Promise<readonly EffectCleanupError[]> | null = null;

  const scope: EffectScope = {
    get status() {
      return status;
    },

    acquire<Value>(setup: EffectSetup<Value>): Promise<Value> {
      if (status !== 'open') {
        return Promise.reject(new EffectScopeClosedError());
      }

      let lateCleanupFailure: EffectCleanupError | null = null;
      const acquisition = Promise.resolve()
        .then(setup)
        .then(async ({ value, cleanup }) => {
          const sequence = nextSequence;
          nextSequence += 1;

          if (status === 'open') {
            armedEffects.push({ sequence, cleanup });
            return value;
          }

          try {
            await cleanup();
          } catch (cause) {
            lateCleanupFailure = new EffectCleanupError(sequence, cause);
          }
          throw new EffectScopeClosedError(lateCleanupFailure ?? undefined);
        });

      acquisitionSettlements.push(
        acquisition.then(
          () => null,
          () => lateCleanupFailure,
        ),
      );
      return acquisition;
    },

    close() {
      if (status === 'open') status = 'closed';
    },

    drain() {
      if (drainPromise !== null) return drainPromise;
      status = 'draining';

      drainPromise = Promise.resolve().then(async () => {
        const failures = (await Promise.all(acquisitionSettlements)).filter(
          (failure): failure is EffectCleanupError => failure !== null,
        );
        const effects = armedEffects.splice(0).reverse();

        for (const effect of effects) {
          try {
            await effect.cleanup();
          } catch (cause) {
            failures.push(new EffectCleanupError(effect.sequence, cause));
          }
        }

        status = 'drained';
        return Object.freeze(failures);
      });
      return drainPromise;
    },
  };

  return scope;
}

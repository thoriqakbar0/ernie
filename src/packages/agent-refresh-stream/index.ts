import { Duration, Effect, Schedule, Stream } from 'effect';

/** Inputs that define one visible, serialized Agent refresh lifecycle. */
export interface AgentRefreshStreamOptions<
  RefreshError,
  Requirements,
  FailureRequirements,
> {
  readonly interval: Duration.Input;
  readonly isVisible: () => boolean;
  readonly onFailure: (
    error: RefreshError,
  ) => Effect.Effect<void, never, FailureRequirements>;
  readonly refresh: () => Effect.Effect<void, RefreshError, Requirements>;
  readonly visibilityTarget: Stream.EventListener<Event>;
}

/**
 * Refresh immediately, on a fixed interval, and when the app becomes visible.
 * The owning fiber serializes work, keeps at most one pending refresh, and owns
 * the event listener until interruption.
 */
export function runAgentRefreshStream<
  RefreshError,
  Requirements,
  FailureRequirements,
>(
  options: AgentRefreshStreamOptions<
    RefreshError,
    Requirements,
    FailureRequirements
  >,
): Effect.Effect<void, never, Requirements | FailureRequirements> {
  const scheduledRefreshes = Stream.succeed(undefined).pipe(
    Stream.concat(
      Stream.fromSchedule(Schedule.spaced(options.interval)).pipe(
        Stream.map(() => undefined),
      ),
    ),
  );
  const visibleRefreshes = Stream.fromEventListener(
    options.visibilityTarget,
    'visibilitychange',
    { bufferSize: 1 },
  ).pipe(
    Stream.filter(options.isVisible),
    Stream.map(() => undefined),
  );

  return scheduledRefreshes.pipe(
    Stream.merge(visibleRefreshes),
    Stream.filter(options.isVisible),
    Stream.buffer({ capacity: 1, strategy: 'sliding' }),
    Stream.mapEffect(() =>
      options.refresh().pipe(Effect.catch(options.onFailure)),
    ),
    Stream.runDrain,
  );
}

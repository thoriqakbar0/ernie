import { Effect, Queue, Stream } from 'effect';

/** Inputs that define one visible, explicitly triggered Agent refresh lifecycle. */
export interface AgentRefreshStreamOptions<
  RefreshError,
  Requirements,
  FailureRequirements,
> {
  readonly isVisible: () => boolean;
  readonly onFailure: (
    error: RefreshError,
  ) => Effect.Effect<void, never, FailureRequirements>;
  readonly refresh: () => Effect.Effect<void, RefreshError, Requirements>;
  readonly visibilityTarget: Stream.EventListener<Event>;
}

/** One coalesced refresh request function and its owned Effect lifecycle. */
export interface AgentRefreshStreamController<Requirements> {
  readonly request: () => void;
  readonly run: Effect.Effect<void, never, Requirements>;
}

/** Create a serialized refresh lifecycle without recurring timer work. */
export function makeAgentRefreshStream<
  RefreshError,
  Requirements,
  FailureRequirements,
>(
  options: AgentRefreshStreamOptions<
    RefreshError,
    Requirements,
    FailureRequirements
  >,
): Effect.Effect<
  AgentRefreshStreamController<Requirements | FailureRequirements>
> {
  return Effect.gen(function* () {
    const requests = yield* Queue.sliding<void>(1);
    const requestedRefreshes = Stream.fromQueue(requests);
    const visibleRefreshes = Stream.fromEventListener(
      options.visibilityTarget,
      'visibilitychange',
      { bufferSize: 1 },
    ).pipe(Stream.map(() => undefined));
    const run = requestedRefreshes.pipe(
      Stream.merge(visibleRefreshes),
      Stream.filter(options.isVisible),
      Stream.buffer({ capacity: 1, strategy: 'sliding' }),
      Stream.mapEffect(() =>
        options.refresh().pipe(Effect.catch(options.onFailure)),
      ),
      Stream.runDrain,
      Effect.ensuring(Queue.shutdown(requests)),
    );
    return {
      request: () => {
        Queue.offerUnsafe(requests, undefined);
      },
      run,
    };
  });
}

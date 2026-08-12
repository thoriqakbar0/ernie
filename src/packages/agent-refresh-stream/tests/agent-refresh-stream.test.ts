import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Deferred, Effect, Fiber, Ref, Stream } from 'effect';

import { makeAgentRefreshStream } from '../index';

class VisibilityTarget implements Stream.EventListener<Event> {
  readonly #listeners = new Set<(event: Event) => void>();
  readonly #listenerAdded: Promise<void>;
  readonly #resolveListenerAdded: () => void;

  constructor() {
    let resolveListenerAdded = (): void => undefined;
    this.#listenerAdded = new Promise((resolve) => {
      resolveListenerAdded = resolve;
    });
    this.#resolveListenerAdded = resolveListenerAdded;
  }

  addEventListener(_event: string, listener: (event: Event) => void): void {
    this.#listeners.add(listener);
    this.#resolveListenerAdded();
  }

  removeEventListener(_event: string, listener: (event: Event) => void): void {
    this.#listeners.delete(listener);
  }

  dispatch(): void {
    for (const listener of this.#listeners) {
      listener(new Event('visibilitychange'));
    }
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  waitForListener(): Promise<void> {
    return this.#listenerAdded;
  }
}

test('serializes refreshes and keeps only one pending trigger', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const visibilityTarget = new VisibilityTarget();
      const firstStarted = yield* Deferred.make<void>();
      const secondStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const refreshCount = yield* Ref.make(0);
      const activeCount = yield* Ref.make(0);
      const maximumActiveCount = yield* Ref.make(0);
      const refresh = Effect.gen(function* () {
        const active = yield* Ref.updateAndGet(activeCount, (count) => count + 1);
        yield* Ref.update(maximumActiveCount, (maximum) =>
          Math.max(maximum, active),
        );
        const count = yield* Ref.updateAndGet(refreshCount, (value) => value + 1);
        if (count === 1) {
          yield* Deferred.succeed(firstStarted, undefined);
          yield* Deferred.await(releaseFirst);
        } else if (count === 2) {
          yield* Deferred.succeed(secondStarted, undefined);
        }
        yield* Ref.update(activeCount, (value) => value - 1);
      });
      const controller = yield* makeAgentRefreshStream({
        isVisible: () => true,
        onFailure: () => Effect.void,
        refresh: () => refresh,
        visibilityTarget,
      });
      const fiber = yield* controller.run.pipe(Effect.forkChild);

      controller.request();
      yield* Deferred.await(firstStarted);
      controller.request();
      controller.request();

      assert.equal(yield* Ref.get(refreshCount), 1);
      assert.equal(yield* Ref.get(maximumActiveCount), 1);

      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Deferred.await(secondStarted);

      assert.equal(yield* Ref.get(maximumActiveCount), 1);
      yield* Fiber.interrupt(fiber);
    }),
  ));

test('pauses while hidden and removes its listener when interrupted', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const visibilityTarget = new VisibilityTarget();
      const refreshed = yield* Deferred.make<void>();
      const refreshCount = yield* Ref.make(0);
      let visible = false;
      const controller = yield* makeAgentRefreshStream({
        isVisible: () => visible,
        onFailure: () => Effect.void,
        refresh: () =>
          Effect.gen(function* () {
            yield* Ref.update(refreshCount, (count) => count + 1);
            yield* Deferred.succeed(refreshed, undefined);
          }),
        visibilityTarget,
      });
      const fiber = yield* controller.run.pipe(Effect.forkChild);

      yield* Effect.promise(() => visibilityTarget.waitForListener());
      controller.request();
      yield* Effect.yieldNow;
      assert.equal(yield* Ref.get(refreshCount), 0);

      visible = true;
      visibilityTarget.dispatch();
      yield* Deferred.await(refreshed);
      assert.equal(yield* Ref.get(refreshCount), 1);
      assert.equal(visibilityTarget.listenerCount, 1);

      yield* Fiber.interrupt(fiber);
      assert.equal(visibilityTarget.listenerCount, 0);

      visibilityTarget.dispatch();
      yield* Effect.yieldNow;
      assert.equal(yield* Ref.get(refreshCount), 1);
    }),
  ));

test('handles a refresh failure and continues on the next trigger', () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const visibilityTarget = new VisibilityTarget();
      const failures = yield* Ref.make(0);
      const firstFailureHandled = yield* Deferred.make<void>();
      const secondFailureHandled = yield* Deferred.make<void>();
      const controller = yield* makeAgentRefreshStream({
        isVisible: () => true,
        onFailure: () =>
          Effect.gen(function* () {
            const count = yield* Ref.updateAndGet(failures, (value) => value + 1);
            if (count === 1) {
              yield* Deferred.succeed(firstFailureHandled, undefined);
            } else if (count === 2) {
              yield* Deferred.succeed(secondFailureHandled, undefined);
            }
          }),
        refresh: () => Effect.fail('offline'),
        visibilityTarget,
      });
      const fiber = yield* controller.run.pipe(Effect.forkChild);

      controller.request();
      yield* Deferred.await(firstFailureHandled);
      controller.request();
      yield* Deferred.await(secondFailureHandled);

      assert.equal(yield* Ref.get(failures), 2);
      yield* Fiber.interrupt(fiber);
    }),
  ));

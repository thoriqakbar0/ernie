import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Deferred, Effect, Fiber, Ref, Stream } from 'effect';
import { TestClock } from 'effect/testing';

import { runAgentRefreshStream } from '../index';

class VisibilityTarget implements Stream.EventListener<Event> {
  readonly #listeners = new Set<(event: Event) => void>();

  addEventListener(_event: string, listener: (event: Event) => void): void {
    this.#listeners.add(listener);
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
}

function runTest(effect: Effect.Effect<void, never, TestClock.TestClock>) {
  return Effect.runPromise(effect.pipe(Effect.provide(TestClock.layer())));
}

test('serializes refreshes and keeps only one pending trigger', () =>
  runTest(
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
      const fiber = yield* runAgentRefreshStream({
        interval: 1_500,
        isVisible: () => true,
        onFailure: () => Effect.void,
        refresh: () => refresh,
        visibilityTarget,
      }).pipe(Effect.forkChild);

      yield* Deferred.await(firstStarted);
      visibilityTarget.dispatch();
      visibilityTarget.dispatch();
      yield* TestClock.adjust(1_500);

      assert.equal(yield* Ref.get(refreshCount), 1);
      assert.equal(yield* Ref.get(maximumActiveCount), 1);

      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Deferred.await(secondStarted);

      assert.equal(yield* Ref.get(maximumActiveCount), 1);
      yield* Fiber.interrupt(fiber);
    }),
  ));

test('pauses while hidden and removes its listener when interrupted', () =>
  runTest(
    Effect.gen(function* () {
      const visibilityTarget = new VisibilityTarget();
      const refreshed = yield* Deferred.make<void>();
      const refreshCount = yield* Ref.make(0);
      let visible = false;
      const fiber = yield* runAgentRefreshStream({
        interval: 1_500,
        isVisible: () => visible,
        onFailure: () => Effect.void,
        refresh: () =>
          Effect.gen(function* () {
            yield* Ref.update(refreshCount, (count) => count + 1);
            yield* Deferred.succeed(refreshed, undefined);
          }),
        visibilityTarget,
      }).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      yield* TestClock.adjust(4_500);
      assert.equal(yield* Ref.get(refreshCount), 0);
      assert.equal(visibilityTarget.listenerCount, 1);

      visible = true;
      visibilityTarget.dispatch();
      yield* Deferred.await(refreshed);
      assert.equal(yield* Ref.get(refreshCount), 1);

      yield* Fiber.interrupt(fiber);
      assert.equal(visibilityTarget.listenerCount, 0);

      visibilityTarget.dispatch();
      yield* TestClock.adjust(1_500);
      assert.equal(yield* Ref.get(refreshCount), 1);
    }),
  ));

test('handles a refresh failure and continues on the next trigger', () =>
  runTest(
    Effect.gen(function* () {
      const visibilityTarget = new VisibilityTarget();
      const failures = yield* Ref.make(0);
      const secondFailureHandled = yield* Deferred.make<void>();
      const fiber = yield* runAgentRefreshStream({
        interval: 1_500,
        isVisible: () => true,
        onFailure: () =>
          Effect.gen(function* () {
            const count = yield* Ref.updateAndGet(failures, (value) => value + 1);
            if (count === 2) {
              yield* Deferred.succeed(secondFailureHandled, undefined);
            }
          }),
        refresh: () => Effect.fail('offline'),
        visibilityTarget,
      }).pipe(Effect.forkChild);

      yield* Effect.yieldNow;
      yield* TestClock.adjust(1_500);
      yield* Deferred.await(secondFailureHandled);

      assert.equal(yield* Ref.get(failures), 2);
      yield* Fiber.interrupt(fiber);
    }),
  ));

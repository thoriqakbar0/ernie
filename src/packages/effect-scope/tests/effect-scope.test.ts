import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createEffectScope,
  EffectCleanupError,
  EffectScopeClosedError,
} from '@/packages/effect-scope';

test('drains acquired effects once in reverse acquisition order', async () => {
  const cleanupOrder: string[] = [];
  const scope = createEffectScope();

  await scope.acquire(() => ({
    value: 'first',
    cleanup: () => {
      cleanupOrder.push('first');
    },
  }));
  await scope.acquire(() => ({
    value: 'second',
    cleanup: () => {
      cleanupOrder.push('second');
    },
  }));
  scope.close();

  assert.deepEqual(await scope.drain(), []);
  assert.deepEqual(await scope.drain(), []);
  assert.deepEqual(cleanupOrder, ['second', 'first']);
  assert.equal(scope.status, 'drained');
});

test('continues draining after cleanup failures', async () => {
  const cleanupOrder: string[] = [];
  const scope = createEffectScope();

  await scope.acquire(() => ({
    value: undefined,
    cleanup: () => {
      cleanupOrder.push('first');
      throw new Error('first failed');
    },
  }));
  await scope.acquire(() => ({
    value: undefined,
    cleanup: () => {
      cleanupOrder.push('second');
      throw new Error('second failed');
    },
  }));

  const failures = await scope.drain();

  assert.deepEqual(cleanupOrder, ['second', 'first']);
  assert.equal(failures.length, 2);
  assert.ok(failures[0] instanceof EffectCleanupError);
  assert.ok(failures[1] instanceof EffectCleanupError);
  assert.deepEqual(
    failures.map((failure) => failure.sequence),
    [2, 1],
  );
});

test('rejects acquisition after lifecycle closure without running setup', async () => {
  let setupCount = 0;
  const scope = createEffectScope();
  scope.close();

  await assert.rejects(
    scope.acquire(() => {
      setupCount += 1;
      return { value: undefined, cleanup: () => undefined };
    }),
    EffectScopeClosedError,
  );
  assert.equal(setupCount, 0);
});

test('cleans an in-flight acquisition that settles after drain starts', async () => {
  let cleanupCount = 0;
  let releaseSetup = (): void => undefined;
  const setupGate = new Promise<void>((resolve) => {
    releaseSetup = resolve;
  });
  const scope = createEffectScope();

  const acquisition = scope.acquire(async () => {
    await setupGate;
    return {
      value: 'late value',
      cleanup: () => {
        cleanupCount += 1;
      },
    };
  });
  const draining = scope.drain();
  releaseSetup();

  await assert.rejects(acquisition, EffectScopeClosedError);
  assert.deepEqual(await draining, []);
  assert.equal(cleanupCount, 1);
});

test('reports cleanup failure from an acquisition that settles during drain', async () => {
  let releaseSetup = (): void => undefined;
  const setupGate = new Promise<void>((resolve) => {
    releaseSetup = resolve;
  });
  const scope = createEffectScope();

  const acquisition = scope.acquire(async () => {
    await setupGate;
    return {
      value: undefined,
      cleanup: () => {
        throw new Error('late cleanup failed');
      },
    };
  });
  const draining = scope.drain();
  releaseSetup();

  await assert.rejects(acquisition, EffectScopeClosedError);
  const failures = await draining;
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.sequence, 1);
});

test('leaves partial acquisition rollback with the failing setup', async () => {
  const events: string[] = [];
  const scope = createEffectScope();

  await scope.acquire(() => ({
    value: 'owned',
    cleanup: () => {
      events.push('cleanup owned');
    },
  }));
  await assert.rejects(
    scope.acquire(() => {
      events.push('rollback partial');
      throw new Error('setup failed');
    }),
    /setup failed/u,
  );

  await scope.drain();
  assert.deepEqual(events, ['rollback partial', 'cleanup owned']);
});

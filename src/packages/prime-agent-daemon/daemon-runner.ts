import { Effect } from 'effect';

function errorMetadata(error: unknown): Readonly<{
  name: string;
  code: string | number | null;
}> {
  if (!(error instanceof Error)) return { name: 'NonError', code: null };
  const code =
    'code' in error &&
    (typeof error.code === 'string' || typeof error.code === 'number')
      ? error.code
      : null;
  return { name: error.name, code };
}

Effect.runFork(
  Effect.tryPromise(() => import('prime-agent')).pipe(
    Effect.flatMap(({ main }) =>
      Effect.tryPromise(() => main(process.argv.slice(2))),
    ),
    Effect.catchAll((error) =>
      Effect.sync(() => {
        console.error('Prime Agent daemon startup failed.', errorMetadata(error));
        process.exitCode = 1;
      }),
    ),
  ),
);

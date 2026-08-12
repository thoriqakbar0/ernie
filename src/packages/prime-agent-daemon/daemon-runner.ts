import { Effect, Predicate } from 'effect';

interface ErrorMetadata {
  readonly name: string;
  readonly code: string | number | null;
}

function errorMetadata(cause: unknown): ErrorMetadata {
  if (!Predicate.isError(cause)) return { name: 'NonError', code: null };
  const code =
    'code' in cause &&
    (Predicate.isString(cause.code) || Predicate.isNumber(cause.code))
      ? cause.code
      : null;
  return { name: cause.name, code };
}

Effect.runFork(
  Effect.tryPromise(() => import('prime-agent')).pipe(
    Effect.flatMap(({ main }) =>
      Effect.tryPromise(() => main(process.argv.slice(2))),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error('Prime Agent daemon startup failed.', errorMetadata(error));
        process.exitCode = 1;
      }),
    ),
  ),
);

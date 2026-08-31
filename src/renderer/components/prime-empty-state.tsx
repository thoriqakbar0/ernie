type PrimeEmptyStateProps = Readonly<{
  creating: boolean
  cwd: string
  error?: string
  onCreate: () => void
}>

/** Gives a fresh Ernie workspace one clear first action. */
export function PrimeEmptyState({ creating, cwd, error, onCreate }: PrimeEmptyStateProps) {
  const workspaceName = getWorkspaceName(cwd)

  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6 py-12 text-center">
      <div className="flex max-w-md flex-col items-center">
        <div aria-hidden="true" className="relative mb-7 size-11">
          <span className="absolute inset-1 -rotate-8 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
          <span className="absolute inset-1 rotate-8 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
          <span className="absolute inset-0 grid place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <SparkIcon />
          </span>
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Start a conversation
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Prime Agent will work inside{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300" title={cwd}>
            {workspaceName}
          </span>
          .
        </p>
        <button
          className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-sm font-medium text-white transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-wait disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
          data-cy="prime-empty-create"
          disabled={creating}
          onClick={onCreate}
          type="button"
        >
          <PlusIcon />
          {creating ? "Starting..." : "New conversation"}
        </button>
        {creating ? (
          <p className="mt-3 text-xs text-zinc-500" role="status">
            Starting Prime Agent in {workspaceName}...
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 max-w-sm text-sm text-red-700 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function getWorkspaceName(cwd: string) {
  const withoutTrailingSeparators = cwd.replace(/[\\/]+$/, "")
  return withoutTrailingSeparators.split(/[\\/]/).at(-1) || cwd
}

function SparkIcon() {
  return (
    <svg className="size-5" fill="none" viewBox="0 0 20 20">
      <path d="M10 2.5c.45 3.95 2.55 6.05 6.5 6.5-3.95.45-6.05 2.55-6.5 6.5C9.55 11.55 7.45 9.45 3.5 9 7.45 8.55 9.55 6.45 10 2.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

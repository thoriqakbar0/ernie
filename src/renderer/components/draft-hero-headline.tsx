/** Shows the exact working directory where a draft session will begin its first turn. */
export function DraftHeroHeadline({ cwd }: Readonly<{ cwd: string }>) {
  return (
    <h2 className="mx-auto w-full max-w-5xl text-center text-2xl font-normal tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
      What should we build in{" "}
      <span className="border-b border-dotted border-zinc-500/70">{cwd}</span>?
    </h2>
  )
}

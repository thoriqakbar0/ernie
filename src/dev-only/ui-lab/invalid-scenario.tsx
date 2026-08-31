/** Shows a direct error when a requested UI lab scenario does not exist. */
export function InvalidScenario({ received }: Readonly<{ received: string }>) {
  return (
    <main className="grid min-h-screen place-items-center bg-white p-8 text-zinc-950">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Unknown UI lab scenario</h1>
        <p className="text-sm text-zinc-600">
          {`“${received}” is not an Ernie UI lab scenario.`}
        </p>
      </div>
    </main>
  )
}

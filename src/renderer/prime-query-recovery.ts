import type { QueryClient, Query } from "@tanstack/react-query"

const isRecoverableRead = (query: Query) => {
  const [owner, kind] = query.queryKey
  return (
    owner === "prime-agent" &&
    (kind === "models" ||
      kind === "recurrent-depth" ||
      (kind === "session" && query.state.status === "error"))
  )
}

/** Revalidates reads once per successful connection without replacing settings or command state. */
export const createPrimeQueryRecovery = (queryClient: QueryClient, initialGeneration: number) => {
  let generation = initialGeneration
  return async (next: number) => {
    if (next <= generation) {
      return
    }
    generation = next
    // A late failure from the old transport must not overwrite a recovered read.
    await queryClient.cancelQueries({ predicate: isRecoverableRead })
    if (next !== generation) {
      return
    }
    await queryClient.invalidateQueries({ predicate: isRecoverableRead })
  }
}

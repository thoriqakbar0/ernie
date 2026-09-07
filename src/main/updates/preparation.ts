/** Dependency installation capabilities supplied by the bundled runtime adapter. */
export type PreparationPort = Readonly<{ signature: () => Promise<string>; installed: () => Promise<boolean>; install: () => Promise<void> }>

/** Reuses successful preparation only while its dependency signature and installation remain valid. */
export class PreparedDependencies {
  private signature: string | null = null

  /** Failed installs are never cached; changed or removed dependencies require fresh preparation. */
  async ensure(port: PreparationPort): Promise<void> {
    const signature = await port.signature()
    if (signature === this.signature && await port.installed()) return
    this.signature = null
    await port.install()
    this.signature = await port.signature()
  }
}

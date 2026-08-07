/** Renderer-safe projections for locally listening development servers. */

/** A minimized local server identity containing no process metadata. */
export interface DevServer {
  /** TCP port accepting loopback connections. */
  readonly port: number;
  /** Canonical, navigation-safe local URL. */
  readonly url: `http://${"127.0.0.1" | "[::1]"}:${number}`;
}

/** One immutable view of currently discoverable local development servers. */
export interface DevServerSnapshot {
  /** Monotonically increasing revision assigned after each successful refresh. */
  readonly revision: number;
  /** ISO timestamp at which discovery completed. */
  readonly updatedAt: string;
  /** Servers sorted by ascending port. */
  readonly servers: readonly DevServer[];
}

/** Renderer-safe notifications from the local development-server catalog. */
export type DevServerCatalogEvent =
  | { readonly kind: "snapshot"; readonly snapshot: DevServerSnapshot }
  | { readonly kind: "error"; readonly code: "discovery_failed"; readonly message: string };

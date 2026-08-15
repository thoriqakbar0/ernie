import type { BrowserPluginLease } from '../index.js';

interface OwnedBrowserPluginLease {
  readonly lease: BrowserPluginLease;
  readonly ownerId: number;
}

/** Main-process ownership rules for Browser activation leases. */
export interface BrowserPluginLeaseRegistry {
  /** Replace any current lease with a new main-issued lease for one renderer. */
  acquire(ownerId: number): BrowserPluginLease;

  /** Report whether one renderer currently owns the Browser activation lease. */
  isOwnedBy(ownerId: number): boolean;

  /** Release a matching lease once; stale and repeated releases are no-ops. */
  release(ownerId: number, lease: BrowserPluginLease): void;

  /** Release the current lease when its renderer disappears. */
  releaseOwner(ownerId: number): void;

  /** Release the current lease during controller or application shutdown. */
  releaseAll(): void;
}

/** Create the authoritative main-process Browser activation-lease registry. */
export function createBrowserPluginLeaseRegistry(
  onRelease: (lease: BrowserPluginLease) => void,
): BrowserPluginLeaseRegistry {
  let active: OwnedBrowserPluginLease | null = null;
  let nextSequence = 0;

  const releaseActive = (): void => {
    const owned = active;
    if (owned === null) return;
    active = null;
    onRelease(owned.lease);
  };

  return {
    acquire(ownerId) {
      releaseActive();
      nextSequence += 1;
      const lease = Object.freeze({ id: `browser-lease-${nextSequence}` });
      active = { lease, ownerId };
      return lease;
    },
    isOwnedBy(ownerId) {
      return active?.ownerId === ownerId;
    },
    release(ownerId, lease) {
      if (active?.ownerId !== ownerId || active.lease.id !== lease.id) return;
      releaseActive();
    },
    releaseOwner(ownerId) {
      if (active?.ownerId !== ownerId) return;
      releaseActive();
    },
    releaseAll() {
      releaseActive();
    },
  };
}

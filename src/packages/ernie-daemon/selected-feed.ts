/** Identity of one renderer's current daemon feed. */
export interface SelectedFeedOwner {
  readonly senderId: number;
  readonly subscriptionId: string;
}

interface SelectedFeedEntry<Resource> {
  readonly owner: SelectedFeedOwner;
  readonly resource: Resource | null;
}

/** Atomic replacement operations for one selected feed per renderer. */
export interface SelectedFeedRegistry<Resource> {
  /** Attach a resource only while its selection remains authoritative. */
  readonly attach: (
    owner: SelectedFeedOwner,
    resource: Resource,
  ) => boolean;
  /** Test whether an owner still represents its renderer's selection. */
  readonly isCurrent: (owner: SelectedFeedOwner) => boolean;
  /** Replace a renderer's selection and return its prior resource. */
  readonly replace: (
    senderId: number,
    subscriptionId: string,
  ) => Readonly<{
    owner: SelectedFeedOwner;
    replaced: Resource | null;
  }>;
  /** Stop a selection only when both renderer and subscription still match. */
  readonly stop: (senderId: number, subscriptionId: string) => Resource | null;
  /** Stop whichever selection belongs to a renderer. */
  readonly stopSender: (senderId: number) => Resource | null;
}

/** Create a registry that keeps one authoritative selected feed per renderer. */
export function createSelectedFeedRegistry<Resource>(): SelectedFeedRegistry<Resource> {
  const entries = new Map<number, SelectedFeedEntry<Resource>>();

  const remove = (
    senderId: number,
    expected: SelectedFeedOwner,
  ): Resource | null => {
    const entry = entries.get(senderId);
    if (entry?.owner !== expected) return null;
    entries.delete(senderId);
    return entry.resource;
  };

  return {
    attach(owner, resource) {
      const entry = entries.get(owner.senderId);
      if (entry?.owner !== owner) return false;
      entries.set(owner.senderId, { owner, resource });
      return true;
    },
    isCurrent: (owner) => entries.get(owner.senderId)?.owner === owner,
    replace(senderId, subscriptionId) {
      const previous = entries.get(senderId);
      const owner: SelectedFeedOwner = { senderId, subscriptionId };
      entries.set(senderId, { owner, resource: null });
      return { owner, replaced: previous?.resource ?? null };
    },
    stop(senderId, subscriptionId) {
      const entry = entries.get(senderId);
      return entry === undefined || entry.owner.subscriptionId !== subscriptionId
        ? null
        : remove(senderId, entry.owner);
    },
    stopSender(senderId) {
      const entry = entries.get(senderId);
      return entry === undefined ? null : remove(senderId, entry.owner);
    },
  };
}

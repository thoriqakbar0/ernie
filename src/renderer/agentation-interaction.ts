/** Includes focus moving into Agentation, where the event target is still the old popup. */
export const isAgentationInteraction = (event: Event) => {
  const belongs = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(
      target.closest("[data-agentation-root], [data-agentation-toolbar], [data-feedback-toolbar]"),
    )
  return (
    event.composedPath().some(belongs) ||
    belongs(event.target) ||
    (event instanceof FocusEvent && belongs(event.relatedTarget)) ||
    belongs(document.activeElement)
  )
}

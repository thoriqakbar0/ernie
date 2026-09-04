/** Decorative plus mark. The enclosing control must provide its accessible name. */
export function PlusIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  )
}

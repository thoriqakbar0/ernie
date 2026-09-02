export function ErnieMark({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 48 48">
      <path
        d="M37.6 33.2A18.5 18.5 0 1 1 39.8 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="5.5"
      />
      <path
        d="M13.8 32.5V22.2c0-3.2 2.3-5.4 5.6-5.4h6.1c4.4 0 4.6 5.2 9.1 5.2h3.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5.5"
      />
      <circle cx="40.2" cy="22" fill="var(--accent)" r="4.3" />
    </svg>
  )
}

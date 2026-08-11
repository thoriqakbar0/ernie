import type { ReactNode } from 'react';

interface ShimmerProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/** Source-matched text shimmer used while an inline edit is resolving. */
export function Shimmer({
  children,
  className,
}: ShimmerProps): React.JSX.Element {
  return (
    <span
      className={className}
      style={{
        animation: 'beautiful-shimmer-text 1.4s linear infinite',
        backgroundImage:
          'linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)',
        backgroundSize: '200% 100%',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {children}
    </span>
  );
}

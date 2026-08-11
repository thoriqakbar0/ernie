import { useEffect, useState } from 'react';

interface StreamTextProps {
  readonly text: string;
  readonly onDone?: () => void;
  readonly onProgress?: () => void;
}

/** Reveal text word-by-word while keeping the reference component's cadence. */
export function StreamText({
  text,
  onDone,
  onProgress,
}: StreamTextProps): React.JSX.Element {
  const words = text.split(' ');
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= words.length) {
      onDone?.();
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleCount((current) => current + 1);
      onProgress?.();
    }, 45);
    return () => window.clearTimeout(timer);
  }, [onDone, onProgress, visibleCount, words.length]);

  return (
    <>
      {words.slice(0, visibleCount).join(' ')}
      {visibleCount > 0 && visibleCount < words.length ? ' ' : null}
      {visibleCount < words.length ? (
        <span className="beautiful-stream-caret" aria-hidden="true" />
      ) : null}
    </>
  );
}

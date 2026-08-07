import { ReactNode, RefObject, useEffect, useRef, useState } from "react";

interface ModalDialogProps {
  readonly open: boolean;
  readonly onRequestClose: () => void;
  readonly labelledBy: string;
  readonly className?: string;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly children: ReactNode;
}

const EXIT_CLASS_NAME = "is-exiting";

/**
 * Renders modal content in the browser's top layer and delegates focus containment
 * and document inertness to the native dialog element.
 */
export function ModalDialog({
  open,
  onRequestClose,
  labelledBy,
  className,
  initialFocusRef,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (dialog.open) {
      setIsExiting(false);
      return;
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setIsExiting(false);
    dialog.showModal();

    const frame = requestAnimationFrame(() => initialFocusRef?.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [initialFocusRef, open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || open || !dialog.open) return;

    const restoreFocus = () => {
      dialog.close();
      const previouslyFocused = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      restoreFocus();
      return;
    }

    setIsExiting(true);
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length === 0) {
        if (!cancelled) restoreFocus();
        return;
      }
      void Promise.allSettled(animations.map(({ finished }) => finished)).then(() => {
        if (!cancelled) restoreFocus();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [open]);

  return <dialog
    ref={dialogRef}
    className={["modal-dialog", className, isExiting ? EXIT_CLASS_NAME : undefined].filter(Boolean).join(" ")}
    aria-labelledby={labelledBy}
    onCancel={(event) => {
      event.preventDefault();
      onRequestClose();
    }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onRequestClose();
    }}
  >
    {children}
  </dialog>;
}

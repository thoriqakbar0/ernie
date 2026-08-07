import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ModalDialog } from "./ModalDialog";

type ExecutionTarget = "local" | "modal";

interface RemoteExecutionControlProps {
  readonly executionTarget: ExecutionTarget;
  readonly switchingExecutionTo: ExecutionTarget | undefined;
  readonly disabled: boolean;
  readonly onSelect: (target: ExecutionTarget) => Promise<void>;
}

const TARGETS: ReadonlyArray<{ readonly target: ExecutionTarget; readonly label: string; readonly detail: string }> = [
  { target: "local", label: "Local", detail: "This Mac" },
  { target: "modal", label: "Modal", detail: "Remote runtime" },
];

/** Selects an IPython runtime and confirms switches that destroy a remote runtime. */
export function RemoteExecutionControl({ executionTarget, switchingExecutionTo, disabled, onSelect }: RemoteExecutionControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirmingLocalSwitch, setIsConfirmingLocalSwitch] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const confirmationTitleId = useId();
  const isSwitching = switchingExecutionTo !== undefined;
  const label = isSwitching
    ? "IPython · Switching…"
    : `IPython · ${executionTarget === "modal" ? "Modal" : "Local"}`;

  const close = (restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const open = (focusIndex = TARGETS.findIndex(({ target }) => target === executionTarget)) => {
    if (disabled) return;
    setIsOpen(true);
    requestAnimationFrame(() => optionRefs.current[Math.max(0, focusIndex)]?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;
    const pointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const focusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", pointerDown);
    document.addEventListener("focusin", focusIn);
    return () => {
      document.removeEventListener("pointerdown", pointerDown);
      document.removeEventListener("focusin", focusIn);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled && isOpen) close();
  }, [disabled, isOpen]);

  const choose = async (target: ExecutionTarget) => {
    if (disabled || target === executionTarget) {
      close(true);
      return;
    }
    if (target === "local" && executionTarget === "modal") {
      close();
      triggerRef.current?.focus();
      setIsConfirmingLocalSwitch(true);
      return;
    }
    close(true);
    await onSelect(target);
  };

  const menuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % TARGETS.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + TARGETS.length) % TARGETS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TARGETS.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      optionRefs.current[nextIndex]?.focus();
    }
  };

  return <div className="execution-control" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="text-control execution-trigger"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={isOpen ? menuId : undefined}
      disabled={disabled}
      onClick={() => isOpen ? close() : open()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          open(event.key === "ArrowDown" ? 0 : TARGETS.length - 1);
        }
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          close(true);
        }
      }}
    >{label}</button>
    {isOpen && <div id={menuId} className="execution-menu" role="menu" aria-label="IPython runtime" onKeyDown={menuKeyDown}>
      {TARGETS.map(({ target, label: optionLabel, detail }, index) => <button
        key={target}
        ref={(element) => { optionRefs.current[index] = element; }}
        type="button"
        className="execution-option"
        role="menuitemradio"
        aria-checked={executionTarget === target}
        onClick={() => void choose(target)}
      >
        <span className="execution-option-copy"><span>{optionLabel}</span><small>{detail}</small></span>
        <span className="execution-option-check" aria-hidden="true">{executionTarget === target ? "✓" : ""}</span>
      </button>)}
    </div>}
    <ModalDialog
      open={isConfirmingLocalSwitch}
      onRequestClose={() => setIsConfirmingLocalSwitch(false)}
      labelledBy={confirmationTitleId}
      className="runtime-switch-dialog"
      initialFocusRef={confirmationCancelRef}
    >
      <div className="runtime-switch-confirmation">
        <h2 id={confirmationTitleId}>Switch to Local IPython?</h2>
        <p>The Modal runtime and all storage attached to it will be permanently destroyed.</p>
        <div className="runtime-switch-actions">
          <button ref={confirmationCancelRef} type="button" onClick={() => setIsConfirmingLocalSwitch(false)}>Cancel</button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setIsConfirmingLocalSwitch(false);
              void onSelect("local");
            }}
          >Delete runtime and switch</button>
        </div>
      </div>
    </ModalDialog>
  </div>;
}

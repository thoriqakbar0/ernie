import { useId, useRef, useState } from "react";
import { ModalDialog } from "./ModalDialog";

/** Local-only recovery for a legacy remote IPython runtime; it never offers remote selection. */
export function LocalRuntimeRecovery({ disabled, switching, onSwitch }: {
  readonly disabled: boolean;
  readonly switching: boolean;
  readonly onSwitch: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return <>
    <button type="button" className="text-control execution-trigger" disabled={disabled} onClick={() => setConfirming(true)}>
      {switching ? "Switching to Local…" : "Switch to Local"}
    </button>
    <ModalDialog open={confirming} onRequestClose={() => setConfirming(false)} labelledBy={titleId} className="runtime-switch-dialog" initialFocusRef={cancelRef}>
      <div className="runtime-switch-confirmation">
        <h2 id={titleId}>Switch to Local IPython?</h2>
        <p>The legacy remote runtime and its attached storage will be permanently destroyed.</p>
        <div className="runtime-switch-actions">
          <button ref={cancelRef} type="button" onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" className="danger" onClick={() => { setConfirming(false); void onSwitch(); }}>Delete remote runtime and switch</button>
        </div>
      </div>
    </ModalDialog>
  </>;
}

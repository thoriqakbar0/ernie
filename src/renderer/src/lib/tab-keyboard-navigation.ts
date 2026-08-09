import type { KeyboardEvent } from "react";

export function horizontalTabStep(event: KeyboardEvent<HTMLButtonElement>): -1 | 1 | undefined {
  const rtl = window.getComputedStyle(event.currentTarget).direction === "rtl";
  if (event.key === "ArrowLeft") return rtl ? 1 : -1;
  if (event.key === "ArrowRight") return rtl ? -1 : 1;
  return undefined;
}

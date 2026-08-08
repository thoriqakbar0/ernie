import { useLayoutEffect } from "react";
import { DialRoot, useDialKit, type DialConfig } from "dialkit";
import "dialkit/styles.css";

const READING_DIALS = {
  transcriptFontSizePx: [16, 13, 22, 0.5] as [number, number, number, number],
};

/** Development-only reading control. Production never imports this module or DialKit's CSS. */
export function DevelopmentDialKitTools() {
  const values = useDialKit("Transcript reading", READING_DIALS, { persist: { key: "ernie-reading-dials" } });

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--transcript-font-size", `${values.transcriptFontSizePx}px`);
    return () => { root.style.removeProperty("--transcript-font-size"); };
  }, [values.transcriptFontSizePx]);

  return <DialRoot position="bottom-right" theme="dark" />;
}

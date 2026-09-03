import * as stylex from "@stylexjs/stylex"
import { styles } from "./draft-hero-headline.stylex"
/** Shows the exact working directory where a draft session will begin its first turn. */
export function DraftHeroHeadline({ cwd }: Readonly<{ cwd: string }>) {
  return (
    <h2 {...stylex.props(styles.mxAuto, styles.wFull, styles.maxW5xl, styles.textCenter, styles.text2xl, styles.fontNormal, styles.trackingTight, styles.textZinc900, styles.smText3xl, styles.darkTextZinc100)}>
      What should we build in{" "}
      <span {...stylex.props(styles.borderB, styles.borderDotted, styles.borderZinc50070)}>{cwd}</span>?
    </h2>
  )
}

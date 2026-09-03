import * as stylex from "@stylexjs/stylex"
import { styles } from "./prime-empty-state.stylex"
type PrimeEmptyStateProps = Readonly<{
  creating: boolean
  cwd: string
  error?: string
  onCreate: () => void
}>

/** Gives a fresh Ernie workspace one clear first action. */
export function PrimeEmptyState({ creating, cwd, error, onCreate }: PrimeEmptyStateProps) {
  const workspaceName = getWorkspaceName(cwd)

  return (
    <div {...stylex.props(styles.flex, styles.hFull, styles.minH0, styles.itemsCenter, styles.justifyCenter, styles.px6, styles.py12, styles.textCenter)}>
      <div {...stylex.props(styles.flex, styles.maxWMd, styles.flexCol, styles.itemsCenter)}>
        <div aria-hidden="true" {...stylex.props(styles.relative, styles.mb7, styles.size11)}>
          <span {...stylex.props(styles.absolute, styles.inset1, styles.negativeRotate8, styles.roundedXl, styles.border, styles.borderZinc200, styles.bgWhite, styles.darkBorderZinc800, styles.darkBgZinc900)} />
          <span {...stylex.props(styles.absolute, styles.inset1, styles.rotate8, styles.roundedXl, styles.border, styles.borderZinc200, styles.bgWhite, styles.darkBorderZinc800, styles.darkBgZinc900)} />
          <span {...stylex.props(styles.absolute, styles.inset0, styles.grid, styles.placeItemsCenter, styles.roundedXl, styles.border, styles.borderZinc200, styles.bgWhite, styles.textZinc700, styles.shadowSm, styles.darkBorderZinc700, styles.darkBgZinc900, styles.darkTextZinc200)}>
            <SparkIcon />
          </span>
        </div>
        <h2 {...stylex.props(styles.textXl, styles.fontSemibold, styles.trackingTight, styles.textZinc950, styles.darkTextZinc50)}>
          Start a conversation
        </h2>
        <p {...stylex.props(styles.mt2, styles.maxWSm, styles.textSm, styles.leading6, styles.textZinc500, styles.darkTextZinc400)}>
          Prime Agent will work inside{" "}
          <span {...stylex.props(styles.fontMedium, styles.textZinc700, styles.darkTextZinc300)} title={cwd}>
            {workspaceName}
          </span>
          .
        </p>
        <button
          {...stylex.props(styles.mt6, styles.inlineFlex, styles.h9, styles.itemsCenter, styles.gap2, styles.roundedLg, styles.bgZinc900, styles.px35, styles.textSm, styles.fontMedium, styles.textWhite, styles.transition, styles.hoverBgZinc700, styles.focusVisibleOutline2, styles.focusVisibleOutlineOffset2, styles.focusVisibleOutlineZinc500, styles.disabledCursorWait, styles.disabledOpacity60, styles.darkBgZinc100, styles.darkTextZinc950, styles.darkHoverBgWhite)}
          data-cy="prime-empty-create"
          disabled={creating}
          onClick={onCreate}
          type="button"
        >
          <PlusIcon />
          {creating ? "Starting..." : "New conversation"}
        </button>
        {creating ? (
          <p {...stylex.props(styles.mt3, styles.textXs, styles.textZinc500)} role="status">
            Starting Prime Agent in {workspaceName}...
          </p>
        ) : null}
        {error ? (
          <p {...stylex.props(styles.mt3, styles.maxWSm, styles.textSm, styles.textRed700, styles.darkTextRed400)} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function getWorkspaceName(cwd: string) {
  const withoutTrailingSeparators = cwd.replace(/[\\/]+$/, "")
  return withoutTrailingSeparators.split(/[\\/]/).at(-1) || cwd
}

function SparkIcon() {
  return (
    <svg {...stylex.props(styles.size5)} fill="none" viewBox="0 0 20 20">
      <path d="M10 2.5c.45 3.95 2.55 6.05 6.5 6.5-3.95.45-6.05 2.55-6.5 6.5C9.55 11.55 7.45 9.45 3.5 9 7.45 8.55 9.55 6.45 10 2.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" {...stylex.props(styles.size4)} fill="none" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

import { Popover } from "@base-ui/react/popover"
import * as stylex from "@stylexjs/stylex"
import type { PropsWithChildren } from "react"
import { styles } from "./ui-annotations.styles"

/** Keeps the note editor anchored to its selected element during scrolling and resizing. */
export const UiAnnotationPopup = ({ anchor, children }: PropsWithChildren<{ anchor?: Element }>) =>
  anchor ? (
    <Popover.Root open modal={false}>
      <Popover.Positioner
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        {...stylex.props(styles.positioner)}
      >
        <Popover.Popup
          aria-label="UI annotation"
          data-ui-annotator
          initialFocus={false}
          finalFocus={false}
          {...stylex.props(styles.popup)}
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Root>
  ) : (
    <aside aria-label="UI annotation" data-ui-annotator {...stylex.props(styles.contextual)}>
      {children}
    </aside>
  )

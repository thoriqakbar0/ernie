import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import * as stylex from "@stylexjs/stylex"
import { controlStyles } from "./styles"
import type { StyledProps } from "./styles"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const styles = stylex.create({
  SelectContent: {
    backgroundColor: "var(--surface)",
    borderRadius: 8,
    boxShadow:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent)",
    color: "var(--ink)",
    isolation: "isolate",
    maxHeight: "var(--available-height)",
    minWidth: 144,
    opacity: {
      ":is([data-starting-style], [data-ending-style])": 0,
      default: 1,
    },
    overflowX: "hidden",
    overflowY: "auto",
    position: "relative",
    scale: {
      ":is([data-starting-style], [data-ending-style])": 0.95,
      default: 1,
    },
    transformOrigin: "var(--transform-origin)",
    transition: "opacity 100ms, scale 100ms",
    width: "var(--anchor-width)",
    zIndex: 50,
  },
  SelectGroup: {
    padding: 4,
    scrollMarginBlock: 4,
  },
  SelectItem: {
    alignItems: "center",
    backgroundColor: {
      ":focus": "var(--surface-muted)",
      ":is([data-highlighted])": "var(--surface-muted)",
      default: "transparent",
    },
    borderRadius: 6,
    color: {
      ":focus": "var(--ink-strong)",
      default: "var(--ink)",
    },
    cursor: "default",
    display: "flex",
    fontSize: 14,
    gap: 6,
    opacity: {
      ":is([data-disabled])": 0.5,
      default: 1,
    },
    outlineStyle: "none",
    paddingBlock: 4,
    paddingInlineEnd: 32,
    paddingInlineStart: 6,
    pointerEvents: {
      ":is([data-disabled])": "none",
      default: "auto",
    },
    position: "relative",
    userSelect: "none",
    width: "100%",
  },
  SelectScrollDownButton: {
    alignItems: "center",
    backgroundColor: "var(--surface)",
    bottom: 0,
    cursor: "default",
    display: "flex",
    justifyContent: "center",
    paddingBlock: 4,
    width: "100%",
    zIndex: 10,
  },
  SelectScrollUpButton: {
    alignItems: "center",
    backgroundColor: "var(--surface)",
    cursor: "default",
    display: "flex",
    justifyContent: "center",
    paddingBlock: 4,
    top: 0,
    width: "100%",
    zIndex: 10,
  },
  SelectTrigger: {
    alignItems: "center",
    color: {
      ":is([data-placeholder])": "var(--muted)",
      default: "var(--ink)",
    },
    display: "flex",
    gap: 6,
    height: {
      ':is([data-size="sm"])': 28,
      default: 32,
    },
    justifyContent: "space-between",
    paddingBlock: 8,
    paddingInlineEnd: 8,
    paddingInlineStart: 10,
    userSelect: "none",
    whiteSpace: "nowrap",
    width: "fit-content",
  },
  SelectValue: {
    alignItems: "center",
    display: "flex",
    flex: 1,
    gap: 6,
    overflow: "hidden",
    textAlign: "start",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  indicator: {
    alignItems: "center",
    display: "flex",
    height: 16,
    insetInlineEnd: 8,
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
    width: 16,
  },
  itemText: {
    display: "flex",
    flex: 1,
    flexShrink: 0,
    gap: 8,
    whiteSpace: "nowrap",
  },
  positioner: {
    isolation: "isolate",
    // Select menus portal to the document and must clear their parent popovers.
    zIndex: 1200,
  },
  selectIcon: {
    color: "var(--muted)",
    height: 16,
    pointerEvents: "none",
    width: 16,
  },
})

const Select = SelectPrimitive.Root
const SelectGroup = ({ xstyle, ...props }: StyledProps<SelectPrimitive.Group.Props>) => (
  <SelectPrimitive.Group
    data-slot="select-group"
    {...stylex.props(styles.SelectGroup, xstyle)}
    {...props}
  />
)
const SelectValue = ({ xstyle, ...props }: StyledProps<SelectPrimitive.Value.Props>) => (
  <SelectPrimitive.Value
    data-slot="select-value"
    {...stylex.props(styles.SelectValue, xstyle)}
    {...props}
  />
)
const SelectTrigger = ({
  xstyle,
  size = "default",
  children,
  ...props
}: StyledProps<SelectPrimitive.Trigger.Props> & {
  size?: "sm" | "default"
}) => (
  <SelectPrimitive.Trigger
    data-slot="select-trigger"
    data-size={size}
    {...stylex.props(controlStyles.control, styles.SelectTrigger, xstyle)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon
      render={
        <ChevronDownIcon
          {...stylex.props(styles.selectIcon)}
          {...stylex.props(controlStyles.icon)}
        />
      }
    />
  </SelectPrimitive.Trigger>
)
const SelectItem = ({ xstyle, children, ...props }: StyledProps<SelectPrimitive.Item.Props>) => (
  <SelectPrimitive.Item
    data-slot="select-item"
    {...stylex.props(styles.SelectItem, xstyle)}
    {...props}
  >
    <SelectPrimitive.ItemText {...stylex.props(styles.itemText)}>
      {children}
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator render={<span {...stylex.props(styles.indicator)} />}>
      <CheckIcon {...stylex.props(controlStyles.icon)} {...stylex.props(controlStyles.icon)} />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
)
const SelectScrollUpButton = ({
  xstyle,
  ...props
}: StyledProps<React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>>) => (
  <SelectPrimitive.ScrollUpArrow
    data-slot="select-scroll-up-button"
    {...stylex.props(styles.SelectScrollUpButton, xstyle)}
    {...props}
  >
    <ChevronUpIcon {...stylex.props(controlStyles.icon)} />
  </SelectPrimitive.ScrollUpArrow>
)
const SelectScrollDownButton = ({
  xstyle,
  ...props
}: StyledProps<React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>>) => (
  <SelectPrimitive.ScrollDownArrow
    data-slot="select-scroll-down-button"
    {...stylex.props(styles.SelectScrollDownButton, xstyle)}
    {...props}
  >
    <ChevronDownIcon {...stylex.props(controlStyles.icon)} />
  </SelectPrimitive.ScrollDownArrow>
)
const SelectContent = ({
  xstyle,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: StyledProps<SelectPrimitive.Popup.Props> &
  Pick<
    StyledProps<SelectPrimitive.Positioner.Props>,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={alignItemWithTrigger}
      {...stylex.props(styles.positioner)}
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        data-align-trigger={alignItemWithTrigger}
        {...stylex.props(styles.SelectContent, xstyle)}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List>{children}</SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  </SelectPrimitive.Portal>
)
export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue }

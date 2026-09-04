import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import * as stylex from "@stylexjs/stylex"
import { controlStyles, type StyledProps } from "./styles"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"
const Select = SelectPrimitive.Root
function SelectGroup({ xstyle, ...props }: StyledProps<SelectPrimitive.Group.Props>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      {...stylex.props(styles.SelectGroup, xstyle)}
      {...props}
    />
  )
}
function SelectValue({ xstyle, ...props }: StyledProps<SelectPrimitive.Value.Props>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      {...stylex.props(styles.SelectValue, xstyle)}
      {...props}
    />
  )
}
function SelectTrigger({
  xstyle,
  size = "default",
  children,
  ...props
}: StyledProps<SelectPrimitive.Trigger.Props> & {
  size?: "sm" | "default"
}) {
  return (
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
}
function SelectContent({
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
  >) {
  return (
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
}
function SelectLabel({ xstyle, ...props }: StyledProps<SelectPrimitive.GroupLabel.Props>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      {...stylex.props(styles.SelectLabel, xstyle)}
      {...props}
    />
  )
}
function SelectItem({ xstyle, children, ...props }: StyledProps<SelectPrimitive.Item.Props>) {
  return (
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
}
function SelectSeparator({ xstyle, ...props }: StyledProps<SelectPrimitive.Separator.Props>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      {...stylex.props(styles.SelectSeparator, xstyle)}
      {...props}
    />
  )
}
function SelectScrollUpButton({
  xstyle,
  ...props
}: StyledProps<React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      {...stylex.props(styles.SelectScrollUpButton, xstyle)}
      {...props}
    >
      <ChevronUpIcon {...stylex.props(controlStyles.icon)} />
    </SelectPrimitive.ScrollUpArrow>
  )
}
function SelectScrollDownButton({
  xstyle,
  ...props
}: StyledProps<React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      {...stylex.props(styles.SelectScrollDownButton, xstyle)}
      {...props}
    >
      <ChevronDownIcon {...stylex.props(controlStyles.icon)} />
    </SelectPrimitive.ScrollDownArrow>
  )
}
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
const styles = stylex.create({
  SelectGroup: {
    scrollMarginBlock: 4,
    padding: 4,
  },
  SelectValue: {
    display: "flex",
    flex: 1,
    textAlign: "start",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  SelectTrigger: {
    display: "flex",
    width: "fit-content",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingBlock: 8,
    paddingInlineEnd: 8,
    paddingInlineStart: 10,
    whiteSpace: "nowrap",
    userSelect: "none",
    height: {
      default: 32,
      ':is([data-size="sm"])': 28,
    },
    color: {
      default: "var(--ink)",
      ":is([data-placeholder])": "var(--muted)",
    },
  },
  selectIcon: {
    width: 16,
    height: 16,
    pointerEvents: "none",
    color: "var(--muted)",
  },
  positioner: {
    isolation: "isolate",
    zIndex: 50,
  },
  SelectContent: {
    position: "relative",
    isolation: "isolate",
    zIndex: 50,
    maxHeight: "var(--available-height)",
    width: "var(--anchor-width)",
    minWidth: 144,
    transformOrigin: "var(--transform-origin)",
    overflowX: "hidden",
    overflowY: "auto",
    borderRadius: 8,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    boxShadow:
      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 0 0 1px color-mix(in srgb, var(--ink) 10%, transparent)",
    opacity: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0,
    },
    scale: {
      default: 1,
      ":is([data-starting-style], [data-ending-style])": 0.95,
    },
    transition: "opacity 100ms, scale 100ms",
  },
  SelectLabel: {
    paddingInline: 6,
    paddingBlock: 4,
    fontSize: 12,
    color: "var(--muted)",
  },
  SelectItem: {
    position: "relative",
    display: "flex",
    width: "100%",
    cursor: "default",
    alignItems: "center",
    gap: 6,
    borderRadius: 6,
    paddingBlock: 4,
    paddingInlineEnd: 32,
    paddingInlineStart: 6,
    fontSize: 14,
    outlineStyle: "none",
    userSelect: "none",
    backgroundColor: {
      default: "transparent",
      ":focus": "var(--surface-muted)",
      ":is([data-highlighted])": "var(--surface-muted)",
    },
    color: {
      default: "var(--ink)",
      ":focus": "var(--ink-strong)",
    },
    pointerEvents: {
      default: "auto",
      ":is([data-disabled])": "none",
    },
    opacity: {
      default: 1,
      ":is([data-disabled])": 0.5,
    },
  },
  itemText: {
    display: "flex",
    flex: 1,
    flexShrink: 0,
    gap: 8,
    whiteSpace: "nowrap",
  },
  indicator: {
    pointerEvents: "none",
    position: "absolute",
    insetInlineEnd: 8,
    display: "flex",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  SelectSeparator: {
    pointerEvents: "none",
    marginInline: -4,
    marginBlock: 4,
    height: 1,
    backgroundColor: "var(--rule)",
  },
  SelectScrollUpButton: {
    top: 0,
    zIndex: 10,
    display: "flex",
    width: "100%",
    cursor: "default",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--surface)",
    paddingBlock: 4,
  },
  SelectScrollDownButton: {
    bottom: 0,
    zIndex: 10,
    display: "flex",
    width: "100%",
    cursor: "default",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "var(--surface)",
    paddingBlock: 4,
  },
})

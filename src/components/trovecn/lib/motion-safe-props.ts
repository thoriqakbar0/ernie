import type { CSSProperties, HTMLAttributes } from "react";
import type { MotionStyle } from "motion/react";

type NativeMotionConflict =
  | "onAnimationStart"
  | "onDrag"
  | "onDragEnd"
  | "onDragStart"
  | "style";

type MotionCompatibleAttributes<Element extends HTMLElement> = Omit<
  HTMLAttributes<Element>,
  NativeMotionConflict
> & {
  style?: MotionStyle;
};

function motionStyle(cssStyle: CSSProperties): MotionStyle {
  const style: MotionStyle = {};
  for (const [property, value] of Object.entries(cssStyle)) {
    Reflect.set(style, property, value);
  }
  return style;
}

/** Remove native callbacks whose names Motion owns with incompatible contracts. */
export function motionSafeProps<Element extends HTMLElement>({
  onAnimationStart: _onAnimationStart,
  onDrag: _onDrag,
  onDragEnd: _onDragEnd,
  onDragStart: _onDragStart,
  style,
  ...props
}: HTMLAttributes<Element>): MotionCompatibleAttributes<Element> {
  return style === undefined ? props : { ...props, style: motionStyle(style) };
}

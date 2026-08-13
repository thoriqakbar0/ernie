import type { CSSProperties, HTMLAttributes } from "react";
import type { MotionStyle } from "motion/react";

type NativeMotionConflict =
  | "onAnimationStart"
  | "onDrag"
  | "onDragEnd"
  | "onDragStart"
  | "style";

const unsupportedNativeMotionCallbacks = [
  "onAnimationStart",
  "onDrag",
  "onDragEnd",
  "onDragStart",
] as const satisfies readonly Exclude<NativeMotionConflict, "style">[];

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

/** Translate native attributes while rejecting callbacks Motion cannot preserve. */
export function motionSafeProps<Element extends HTMLElement>(
  attributes: HTMLAttributes<Element>,
): MotionCompatibleAttributes<Element> {
  for (const callback of unsupportedNativeMotionCallbacks) {
    if (attributes[callback] !== undefined) {
      throw new TypeError(
        `${callback} cannot cross a Motion render boundary. Handle it on the owning component.`,
      );
    }
  }

  const {
    onAnimationStart: _onAnimationStart,
    onDrag: _onDrag,
    onDragEnd: _onDragEnd,
    onDragStart: _onDragStart,
    style,
    ...props
  } = attributes;
  return style === undefined ? props : { ...props, style: motionStyle(style) };
}

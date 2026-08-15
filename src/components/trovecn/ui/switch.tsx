"use client";

import { useEffect, useRef, useState } from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion, useMotionValue, useReducedMotion, animate } from "motion/react";
import type { Easing, Transition } from "motion/react";

import { cn } from "@/components/trovecn/lib/utils";
import { spring } from "@/components/trovecn/lib/springs";

const SIZES = {
  default: { track: 34, height: 20, thumb: 16 },
  sm: { track: 24, height: 14, thumb: 12 },
} as const;

const DRAG_DEAD_ZONE = 2;
const TOGGLE_OVERSHOOT = 1;
const TOGGLE_BOUNCE_EASE: Easing = [0.34, 1.35, 0.64, 1];
const TOGGLE_BOUNCE_TRANSITION: Transition = {
  duration: 0.35,
  ease: TOGGLE_BOUNCE_EASE,
  times: [0, 0.55, 0.8, 1],
};

function Switch({
  className,
  size = "default",
  checked: checkedProp,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  ...props
}: Omit<SwitchPrimitive.Root.Props, "inputRef"> & {
  size?: "sm" | "default";
}) {
  const { track, height, thumb } = SIZES[size];
  const offset = (height - thumb) / 2;
  const travel = track - thumb - offset * 2;
  const hoverExtend = (2 * thumb) / 16;
  const pressExtend = (4 * thumb) / 16;
  const pressShrink = (4 * thumb) / 16;

  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked ?? false);
  const checked = checkedProp ?? uncontrolledChecked;

  const applyChecked = (next: boolean, eventDetails?: SwitchPrimitive.Root.ChangeEventDetails) => {
    if (checkedProp === undefined) setUncontrolledChecked(next);
    onCheckedChange?.(next, eventDetails as SwitchPrimitive.Root.ChangeEventDetails);
  };

  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const dragging = useRef(false);
  const suppressNextClick = useRef(false);
  const dragStart = useRef<{ clientX: number; originX: number } | null>(null);

  const thumbWidth = pressed ? thumb + pressExtend : hovered ? thumb + hoverExtend : thumb;
  const thumbHeight = pressed ? thumb - pressShrink : thumb;
  const thumbY = pressed ? offset + pressShrink / 2 : offset;
  const thumbX = checked ? offset + travel - (thumbWidth - thumb) : offset;

  const motionX = useMotionValue(thumbX);
  const reduceMotion = useReducedMotion();
  const hasMountedRef = useRef(false);
  const previousCheckedRef = useRef(checked);
  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  useEffect(() => {
    const checkedChanged = previousCheckedRef.current !== checked;
    previousCheckedRef.current = checked;
    if (dragging.current) return;
    if (!hasMountedRef.current || reduceMotion) {
      motionX.set(thumbX);
      return;
    }
    const controls = checkedChanged
      ? animate(
          motionX,
          [
            motionX.get(),
            thumbX + (checked ? TOGGLE_OVERSHOOT : -TOGGLE_OVERSHOOT),
            thumbX,
            thumbX,
          ],
          TOGGLE_BOUNCE_TRANSITION,
        )
      : animate(motionX, thumbX, spring.moderate.enter);
    return () => controls.stop();
  }, [checked, motionX, reduceMotion, thumbX]);

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next, eventDetails) => {
        if (suppressNextClick.current) return;
        applyChecked(next, eventDetails);
      }}
      className={cn(
        "group/switch relative shrink-0 touch-none rounded-full border border-transparent outline-none transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        checked
          ? hovered
            ? "bg-accent-blue-hover"
            : "bg-accent-blue"
          : hovered
            ? "bg-[color-mix(in_oklch,var(--input),var(--foreground)_10%)] dark:bg-[color-mix(in_oklch,var(--input),var(--foreground)_14%)]"
            : "bg-input",
        className,
      )}
      style={{ width: track, height }}
      onPointerEnter={(e) => {
        if (!disabled && e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(e) => {
        if (disabled) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        setPressed(true);
        dragging.current = false;
        suppressNextClick.current = false;
        dragStart.current = { clientX: e.clientX, originX: motionX.get() };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragStart.current) return;
        const delta = e.clientX - dragStart.current.clientX;
        if (!dragging.current) {
          if (Math.abs(delta) < DRAG_DEAD_ZONE) return;
          dragging.current = true;
        }
        const pressedWidth = thumb + pressExtend;
        const min = offset;
        const max = track - offset - pressedWidth;
        motionX.set(Math.max(min, Math.min(max, dragStart.current.originX + delta)));
      }}
      onPointerUp={() => {
        if (!dragStart.current) return;
        setPressed(false);
        if (dragging.current) {
          suppressNextClick.current = true;
          dragging.current = false;
          const pressedWidth = thumb + pressExtend;
          const min = offset;
          const max = track - offset - pressedWidth;
          const shouldBeOn = motionX.get() > (min + max) / 2;
          if (shouldBeOn !== checked) {
            applyChecked(shouldBeOn);
          } else {
            animate(
              motionX,
              checked ? offset + travel - pressExtend : offset,
              spring.moderate.enter,
            );
          }
          requestAnimationFrame(() => {
            suppressNextClick.current = false;
          });
        }
        dragStart.current = null;
      }}
      onPointerCancel={() => {
        if (!dragStart.current) return;
        setPressed(false);
        if (dragging.current) {
          dragging.current = false;
          animate(motionX, thumbX, spring.moderate.enter);
        }
        dragStart.current = null;
      }}
      {...props}
    >
      <motion.span
        data-slot="switch-thumb"
        className="pointer-events-none absolute -top-px -left-px block rounded-full bg-background shadow-sm dark:bg-foreground"
        style={{ x: motionX }}
        animate={{ y: thumbY, width: thumbWidth, height: thumbHeight }}
        transition={
          !hasMountedRef.current || reduceMotion ? { duration: 0 } : spring.moderate.enter
        }
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

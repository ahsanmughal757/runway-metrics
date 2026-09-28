import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';

interface CountUpProps {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}

/** easeOutCubic, the curve this animated before it was rewritten around a motion value. */
const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;

/**
 * Animated numeric count-up for KPI values. No-ops instantly under
 * prefers-reduced-motion.
 *
 * The displayed number is a `MotionValue` rather than React state, and that is
 * the whole reason the effect below is allowed to exist. The obvious version of
 * this component ticks a `requestAnimationFrame` loop and calls `setState` in
 * it, which is a state update sixty times a second for the length of a number
 * changing: it re-renders whatever contains it, and it is exactly the
 * `set-state-in-effect` pattern the data-layer rewrite exists to remove. Reading
 * the value out of a motion value instead means the animation loop never touches
 * React's state, so the effect is only starting and stopping an animation — a
 * genuine side effect with nothing to schedule around.
 *
 * The alternative was an `eslint-disable` on the loop, which would leave the
 * rule green and the sixty-renders-a-second behaviour in place.
 */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString(), durationMs = 700 }: CountUpProps) {
  const reduceMotion = useReducedMotion();
  const count = useMotionValue(reduceMotion ? value : 0);
  const display = useTransform(count, (latest) => format(latest));

  useEffect(() => {
    if (reduceMotion) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: durationMs / 1000, ease: EASE_OUT_CUBIC });
    return () => controls.stop();
  }, [value, durationMs, reduceMotion, count]);

  return <motion.span>{display}</motion.span>;
}

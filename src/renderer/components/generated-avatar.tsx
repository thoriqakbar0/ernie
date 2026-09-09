import * as stylex from "@stylexjs/stylex"

const bodies = [
  "M-35 8C-43-15-20-41 1-35C26-47 44-20 36 3C49 24 25 42 5 36C-19 47-43 33-35 8Z",
  "M-32-17Q-32-36-13-36H13Q32-36 32-17V19Q32 37 13 37H-13Q-32 37-32 19Z",
  "M0-43L13-20L39-17L22 5L26 32L0 22L-26 32L-22 5L-39-17L-13-20Z",
  "M-31 30V-7C-31-45 31-45 31-7V30Q21 20 11 31Q0 20-11 31Q-22 20-31 30Z",
  "M0-31C-16-54-41-28-27-13C-55-9-46 21-27 20C-34 47-5 49 0 30C13 53 40 32 27 16C54 4 39-23 22-15C33-41 6-50 0-31Z",
  "M-34 18C-38-8-12-37 31-37C41-6 23 35-5 36C-20 36-29 30-34 18Z",
  "M-38 17C-38-6-24-34-5-34C19-43 40-8 37 13Q35 38 5 37Q-31 42-38 17Z",
  "M-33-18Q-39-35-24-38L-10-25H10L25-38Q40-33 33-16V17Q33 37 0 37Q-33 37-33 17Z",
] as const
const colors = [
  "#ffa7c5",
  "#b9a1f4",
  "#91d7c2",
  "#ffd16e",
  "#a5d8f3",
  "#efae87",
  "#d2df8c",
  "#f4a7a3",
] as const
const float = stylex.keyframes({
  "0%, 100%": { transform: "translateY(0) rotate(-2deg)" },
  "50%": { transform: "translateY(-3px) rotate(2deg)" },
})
const blink = stylex.keyframes({
  "0%, 92%, 100%": { transform: "scaleY(1)" },
  "95%": { transform: "scaleY(0.12)" },
})
const styles = stylex.create({
  eyes: {
    animationIterationCount: "infinite",
    animationName: { "@media (prefers-reduced-motion: reduce)": "none", default: blink },
    animationTimingFunction: "ease-in-out",
    transformBox: "fill-box",
    transformOrigin: "center",
  },
  float: {
    animationIterationCount: "infinite",
    animationName: { "@media (prefers-reduced-motion: reduce)": "none", default: float },
    animationTimingFunction: "ease-in-out",
    transformOrigin: "center",
  },
  svg: { height: "100%", overflow: "visible", width: "100%" },
  tempo: (duration: string, delay: string) => ({
    animationDelay: delay,
    animationDuration: duration,
  }),
})

/** Renders a deterministic character recipe; cosmetic motion never represents execution state. */
export const GeneratedCharacter = ({ seed, animated }: { seed: number; animated: boolean }) => {
  const bits = Math.imul(seed ^ 0x9e_37_79_b9, 0x85_eb_ca_6b) >>> 0
  const body = bodies[bits % bodies.length] ?? bodies[0]
  const color = colors[(bits >>> 4) % colors.length] ?? colors[0]
  const eyeGap = 9 + ((bits >>> 8) % 6)
  const expression = (bits >>> 12) % 3
  const duration = `${3 + (bits % 17) / 10}s`
  const delay = `-${(bits % 31) / 10}s`
  return (
    <svg
      {...stylex.props(styles.svg)}
      viewBox="-56 -56 112 112"
      fill="none"
      stroke="#30283d"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g {...stylex.props(animated && styles.float, styles.tempo(duration, delay))}>
        <path d={body} fill={color} />
        {(bits >>> 16) % 3 === 0 ? <path d="M-6-35Q-12-51 3-47Q12-43 5-34" fill={color} /> : null}
        <g {...stylex.props(styles.eyes, styles.tempo(`${4 + (bits % 4)}s`, delay))}>
          {expression === 1 ? (
            <path d={`M${-eyeGap - 4} -4q4-6 8 0M${eyeGap - 4} -4q4-6 8 0`} />
          ) : (
            <>
              <ellipse cx={-eyeGap} cy="-4" rx={expression === 2 ? 7 : 5} ry="8" fill="#fffaf0" />
              <ellipse cx={eyeGap} cy="-4" rx={expression === 2 ? 7 : 5} ry="8" fill="#fffaf0" />
              <circle cx={-eyeGap + 1} cy="-3" r="2.5" fill="#30283d" stroke="none" />
              <circle cx={eyeGap + 1} cy="-3" r="2.5" fill="#30283d" stroke="none" />
            </>
          )}
        </g>
        <path d={expression === 2 ? "M-4 12q4 5 8 0" : "M-7 11q7 10 14 0"} />
        <ellipse cx="-21" cy="11" rx="4" ry="2.5" fill="#e17d83" stroke="none" opacity="0.55" />
        <ellipse cx="21" cy="11" rx="4" ry="2.5" fill="#e17d83" stroke="none" opacity="0.55" />
      </g>
    </svg>
  )
}

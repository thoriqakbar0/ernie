import * as stylex from "@stylexjs/stylex"
import { styles as rosterStyles } from "./agent-roster.styles"
import type { Agent } from "../../packages/agents"

/** Stable variation identifiers retain their meaning when the artwork changes. */
export const avatarNames = { fern: "Robot", tide: "Eyes", ember: "Coffee", iris: "Star" } as const

/** SVG adaptation of Thoriq's ta-0 about-peek-p5 characters, retaining original geometry and colors. */
export function AgentAvatar({ avatar, working = false }: { avatar: Agent["avatar"]; working?: boolean }) {
  const ink = "#20213c"
  const paper = "#fff9ed"
  return <span {...stylex.props(rosterStyles.avatar)} data-working={working} aria-hidden="true">
    <svg {...stylex.props(rosterStyles.avatarSvg)} viewBox="-56 -60 112 112" fill="none" stroke={ink} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
      <g {...stylex.props(working && rosterStyles.working)}>
        {avatar === "fern" ? <>
          <path d="M0-24V-46"/><circle cy="-48" r="6" fill="#a3ff29"/>
          <rect x="-37" y="-26" width="74" height="65" rx="19" fill="#ff4e8a"/>
          <path d="M-37 0l-9 9M37 0l9-8"/><rect x="-26" y="-12" width="52" height="28" rx="11" fill={paper}/>
          <g {...stylex.props(working && rosterStyles.workingEyes)} fill={ink} stroke="none"><circle cx="-12" r="3.5"/><circle cx="12" r="3.5"/></g><path d="M-8 26H8"/>
        </> : avatar === "tide" ? <>
          <ellipse cy="22" rx="42" ry="23.5" fill="#b658ff"/>
          <g {...stylex.props(working && rosterStyles.workingEyes)}><ellipse cx="-19" cy="-4" rx="17" ry="26.5" fill={paper}/><ellipse cx="19" cy="-10" rx="17" ry="26.5" fill={paper}/><ellipse cx="-19" cy="-4" rx="5.5" ry="9.5" fill={ink}/><ellipse cx="19" cy="-10" rx="5.5" ry="9.5" fill={ink}/></g>
        </> : avatar === "ember" ? <>
          <path  d="M-12-36c-17-12 14-15 0-24M13-36c-17-12 14-15 0-24" stroke={paper} strokeWidth="4"/>
          <ellipse cx="31" cy="3" rx="14.5" ry="17" fill="#3effb5"/>
          <path d="M-27-24H25q5 0 5 5v37q0 22-22 22h-18q-22 0-22-22v-37q0-5 5-5Z" fill="#3effb5"/>
          <ellipse cx="-1" cy="-24" rx="31" ry="7.5" fill={paper}/><ellipse cx="-1" cy="-24" rx="22.5" ry="3.5" fill="#725044"/>
          <g {...stylex.props(working && rosterStyles.workingEyes)} fill={ink} stroke="none"><circle cx="-13" cy="4" r="2.5"/><circle cx="11" cy="4" r="2.5"/></g><path d="M-9 10a8 6.5 0 0 0 16 0"/>
        </> : <>
          <polygon points="0,-47 13.52,-18.61 44.7,-14.52 21.87,7.11 27.63,38.02 0,23 -27.63,38.02 -21.87,7.11 -44.7,-14.52 -13.52,-18.61" fill="#3ae4ff"/>
          <g {...stylex.props(working && rosterStyles.workingEyes)} fill={ink} stroke="none"><ellipse cx="-11" cy="-3" rx="2.5" ry="4.5"/><ellipse cx="11" cy="-3" rx="2.5" ry="4.5"/></g><path d="M-8.5 6a8.5 6 0 0 0 17 0"/>
        </>}
      </g>
    </svg>
  </span>
}

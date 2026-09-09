import { Agentation } from "agentation"
import { useConversationDraft } from "../agent-state"
import { usePrimeSessionSelection } from "../prime-agent-state"
import { useAppNavigation } from "../app-navigation"

/** Stages visual feedback in the selected conversation without dispatching a message. */
export const AgentationToolbar = () => {
  const { selectedSessionId } = usePrimeSessionSelection()
  const { childChat, navigate } = useAppNavigation()
  const [draft, setDraft] = useConversationDraft(selectedSessionId ?? "agentation-unselected")
  return (
    <Agentation
      onSubmit={
        selectedSessionId && !childChat
          ? (output) => {
              const feedback = output.replace(/([?&](?:wsToken|token)=)[^&\s)]+/gu, "$1[redacted]")
              const instructions =
                "Inspect the live Ernie interface and these annotated elements first. Describe the visible problem, make the focused change, then verify the same interface state through HMR. Read docs/workflow.md for the interface iteration workflow."
              setDraft([draft, instructions, feedback].filter(Boolean).join("\n\n"))
              navigate("conversation")
              requestAnimationFrame(() =>
                document.querySelector<HTMLTextAreaElement>("#chat-message")?.focus(),
              )
            }
          : undefined
      }
    />
  )
}

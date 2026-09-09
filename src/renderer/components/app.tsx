import { UiAnnotationProvider } from "./global-ui-annotator"
import { UiAnnotationHost } from "./ui-annotation-host"
import { styles as sharedStyles } from "../component-styles"
import { styles } from "./app.styles"
import * as stylex from "@stylexjs/stylex"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { collapsedSidebarLayout } from "../shell-layout.stylex"
import { View } from "@zenbujs/core/react"
import { PanelLeftOpenIcon } from "lucide-react"
import { SIDEBAR_VIEW_TYPE } from "../../packages/view-types"
import type { Roster } from "../../packages/agents"
import { AgentStateProvider, ConversationDraftProvider } from "../agent-state"
import type { AgentClient } from "../agent-state"
import { ConversationFlowProvider } from "../conversation-flow"
import { MessageReadingProvider } from "./ui/message-scroller"
import { AgentCreationProvider } from "../agent-creation"
import { AppNavigationProvider, useAppNavigation } from "../app-navigation"
import { AppSettingsPage } from "./app-settings-page"
import { ChatWorkspace } from "./chat-workspace"
import { BrowserWorkspace } from "./browser-workspace"
import { AppShortcuts } from "./app-shortcuts"

const DevelopmentAgentation = import.meta.env.DEV
  ? lazy(() =>
      import("./agentation-toolbar").then((module) => ({ default: module.AgentationToolbar })),
    )
  : null

/** Keep the conversation mounted so page navigation preserves drafts and scroll position. */
const WorkspacePages = ({ setSidebarOpen }: { setSidebarOpen: (open: boolean) => void }) => {
  const { page } = useAppNavigation()
  return (
    <>
      <div
        hidden={page !== "conversation"}
        {...stylex.props(styles.conversationPage, page !== "conversation" && styles.pageHidden)}
      >
        <ChatWorkspace />
      </div>
      {page === "conversation" ? null : <AppSettingsPage />}
      <UiAnnotationHost id="workspace-fallback" page={page} fallback={1} />
    </>
  )
}

// @lat: [[product#Product contract#Responsive workspace]]
export const App = ({
  roster,
  agentClient,
  updates,
}: { roster?: Roster; agentClient?: AgentClient; updates?: ReactNode } = {}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const shell = useRef<HTMLDivElement>(null)
  const restoreToggleFocus = useRef(false)
  const closeSidebar = () => {
    restoreToggleFocus.current = Boolean(
      shell.current?.querySelector("#ernie-sidebar")?.contains(document.activeElement),
    )
    setSidebarOpen(false)
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "b" ||
        event.repeat ||
        event.isComposing
      ) {
        return
      }
      event.preventDefault()
      restoreToggleFocus.current = Boolean(
        shell.current?.querySelector("#ernie-sidebar")?.contains(document.activeElement) ||
        shell.current?.querySelector('[aria-label="Open sidebar"]') === document.activeElement,
      )
      setSidebarOpen((open) => !open)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
  useEffect(() => {
    if (!restoreToggleFocus.current) {
      return
    }
    shell.current
      ?.querySelector<HTMLButtonElement>(
        sidebarOpen ? '[aria-label="Close sidebar"]' : '[aria-label="Open sidebar"]',
      )
      ?.focus()
    restoreToggleFocus.current = false
  }, [sidebarOpen])
  return (
    <AppNavigationProvider>
      <UiAnnotationProvider>
        <AgentStateProvider roster={roster} client={agentClient}>
          <ConversationDraftProvider>
            <AgentCreationProvider>
              <ConversationFlowProvider>
                <MessageReadingProvider>
                  <AppShortcuts />
                  <div ref={shell} {...stylex.props(styles.appShell)}>
                    <a href="#ernie-main-content" {...stylex.props(styles.skipLink)}>
                      Skip to workspace
                    </a>
                    <main
                      {...stylex.props(
                        styles.appMain,
                        !sidebarOpen && styles.appMainSidebarClosed,
                        !sidebarOpen && collapsedSidebarLayout,
                      )}
                    >
                      <div
                        aria-label="Agent navigation"
                        inert={!sidebarOpen}
                        aria-hidden={!sidebarOpen}
                        {...stylex.props(
                          styles.appSidebarSlot,
                          !sidebarOpen && styles.sidebarLeaving,
                        )}
                      >
                        <View
                          args={{
                            onClose: closeSidebar,
                          }}
                          name={SIDEBAR_VIEW_TYPE}
                          {...stylex.props(styles.viewFill)}
                        />
                      </div>
                      {sidebarOpen ? null : (
                        <button
                          aria-controls="ernie-sidebar"
                          aria-expanded="false"
                          aria-label="Open sidebar"
                          aria-keyshortcuts="Meta+B"
                          title="Open sidebar (⌘B)"
                          onClick={() => {
                            restoreToggleFocus.current = true
                            setSidebarOpen(true)
                          }}
                          type="button"
                          {...stylex.props(styles.sidebarOpenButton)}
                        >
                          <PanelLeftOpenIcon
                            {...stylex.props(sharedStyles.controlIcon, styles.openIcon)}
                          />
                        </button>
                      )}
                      <div
                        id="ernie-main-content"
                        tabIndex={-1}
                        {...stylex.props(
                          styles.workspaceSlot,
                          sidebarOpen && styles.workspaceBehindSidebar,
                        )}
                      >
                        <BrowserWorkspace>
                          <WorkspacePages setSidebarOpen={setSidebarOpen} />
                        </BrowserWorkspace>
                      </div>
                    </main>
                    {updates}
                    {DevelopmentAgentation ? (
                      <Suspense fallback={null}>
                        <DevelopmentAgentation />
                      </Suspense>
                    ) : null}
                  </div>
                </MessageReadingProvider>
              </ConversationFlowProvider>
            </AgentCreationProvider>
          </ConversationDraftProvider>
        </AgentStateProvider>
      </UiAnnotationProvider>
    </AppNavigationProvider>
  )
}

pub(crate) const SOURCE_COMMIT: &str = "e319a66d7351c75abe7f040d02d9a8d6e25028e9";
pub(crate) const PROTOCOL_VERSION: u32 = 7;
pub(crate) const SCHEMA_REVISION: u32 = 22;

#[derive(Clone, Copy)]
pub(crate) struct CommandSpec {
    pub(crate) name: &'static str,
    pub(crate) mutating: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DeadlineClass {
    Immediate,
    Short,
    Interactive,
    Completion,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct Compatibility {
    pub(crate) min_schema_revision: Option<u32>,
    pub(crate) capability: Option<&'static str>,
}

impl Compatibility {
    const LEGACY: Self = Self {
        min_schema_revision: None,
        capability: None,
    };

    const fn schema(revision: u32) -> Self {
        Self {
            min_schema_revision: Some(revision),
            capability: None,
        }
    }

    const fn capability(capability: &'static str) -> Self {
        Self {
            min_schema_revision: None,
            capability: Some(capability),
        }
    }

    const fn schema_and_capability(revision: u32, capability: &'static str) -> Self {
        Self {
            min_schema_revision: Some(revision),
            capability: Some(capability),
        }
    }
}

pub(crate) const COMMANDS: &[CommandSpec] = &[
    CommandSpec {
        name: "ack_result",
        mutating: false,
    },
    CommandSpec {
        name: "list",
        mutating: false,
    },
    CommandSpec {
        name: "list_saved_sessions",
        mutating: false,
    },
    CommandSpec {
        name: "create",
        mutating: true,
    },
    CommandSpec {
        name: "attach",
        mutating: false,
    },
    CommandSpec {
        name: "reattach",
        mutating: false,
    },
    CommandSpec {
        name: "detach",
        mutating: true,
    },
    CommandSpec {
        name: "complete_owned_session",
        mutating: true,
    },
    CommandSpec {
        name: "promote_owned_session",
        mutating: true,
    },
    CommandSpec {
        name: "kill",
        mutating: true,
    },
    CommandSpec {
        name: "rename",
        mutating: true,
    },
    CommandSpec {
        name: "prompt",
        mutating: true,
    },
    CommandSpec {
        name: "cancel_prompt_admission",
        mutating: true,
    },
    CommandSpec {
        name: "prompt_and_wait",
        mutating: true,
    },
    CommandSpec {
        name: "steer",
        mutating: true,
    },
    CommandSpec {
        name: "follow_up",
        mutating: true,
    },
    CommandSpec {
        name: "restore_next_turn",
        mutating: true,
    },
    CommandSpec {
        name: "restore_actions",
        mutating: true,
    },
    CommandSpec {
        name: "append_custom_message",
        mutating: true,
    },
    CommandSpec {
        name: "resume_queue",
        mutating: true,
    },
    CommandSpec {
        name: "send_message",
        mutating: true,
    },
    CommandSpec {
        name: "agent_messages_status",
        mutating: false,
    },
    CommandSpec {
        name: "agent_messages_pause",
        mutating: true,
    },
    CommandSpec {
        name: "agent_messages_resume",
        mutating: true,
    },
    CommandSpec {
        name: "agent_messages_clear",
        mutating: true,
    },
    CommandSpec {
        name: "abort",
        mutating: true,
    },
    CommandSpec {
        name: "start_side_question",
        mutating: true,
    },
    CommandSpec {
        name: "abort_side_question",
        mutating: true,
    },
    CommandSpec {
        name: "execute_bash",
        mutating: true,
    },
    CommandSpec {
        name: "abort_bash",
        mutating: true,
    },
    CommandSpec {
        name: "cancel_rlm_child",
        mutating: true,
    },
    CommandSpec {
        name: "delete_rlm_subagent",
        mutating: true,
    },
    CommandSpec {
        name: "wait_for_idle",
        mutating: false,
    },
    CommandSpec {
        name: "wait_for_headless_completion",
        mutating: true,
    },
    CommandSpec {
        name: "get_session_header",
        mutating: false,
    },
    CommandSpec {
        name: "get_state",
        mutating: false,
    },
    CommandSpec {
        name: "get_connection_state",
        mutating: false,
    },
    CommandSpec {
        name: "get_messages",
        mutating: false,
    },
    CommandSpec {
        name: "get_rlm_children",
        mutating: false,
    },
    CommandSpec {
        name: "get_session_stats",
        mutating: false,
    },
    CommandSpec {
        name: "get_context_tree",
        mutating: false,
    },
    CommandSpec {
        name: "get_commands",
        mutating: false,
    },
    CommandSpec {
        name: "get_resource_snapshot",
        mutating: false,
    },
    CommandSpec {
        name: "replace_acp_mcp_servers",
        mutating: true,
    },
    CommandSpec {
        name: "get_model_catalog",
        mutating: false,
    },
    CommandSpec {
        name: "get_available_models",
        mutating: false,
    },
    CommandSpec {
        name: "get_queue",
        mutating: false,
    },
    CommandSpec {
        name: "mutate_queued_message",
        mutating: true,
    },
    CommandSpec {
        name: "clear_queue",
        mutating: true,
    },
    CommandSpec {
        name: "abort_and_clear_queue",
        mutating: true,
    },
    CommandSpec {
        name: "acquire_session_input_pause",
        mutating: true,
    },
    CommandSpec {
        name: "release_session_input_pause",
        mutating: true,
    },
    CommandSpec {
        name: "cron_list",
        mutating: false,
    },
    CommandSpec {
        name: "heartbeats_list",
        mutating: false,
    },
    CommandSpec {
        name: "heartbeat_manage",
        mutating: true,
    },
    CommandSpec {
        name: "cron_add",
        mutating: true,
    },
    CommandSpec {
        name: "cron_cancel",
        mutating: true,
    },
    CommandSpec {
        name: "heartbeat_get",
        mutating: false,
    },
    CommandSpec {
        name: "heartbeat_set",
        mutating: true,
    },
    CommandSpec {
        name: "heartbeat_update",
        mutating: true,
    },
    CommandSpec {
        name: "set_model",
        mutating: true,
    },
    CommandSpec {
        name: "cycle_model",
        mutating: true,
    },
    CommandSpec {
        name: "set_scoped_models",
        mutating: true,
    },
    CommandSpec {
        name: "set_thinking_level",
        mutating: true,
    },
    CommandSpec {
        name: "set_service_tier",
        mutating: true,
    },
    CommandSpec {
        name: "cycle_thinking_level",
        mutating: true,
    },
    CommandSpec {
        name: "set_transport",
        mutating: true,
    },
    CommandSpec {
        name: "set_steering_mode",
        mutating: true,
    },
    CommandSpec {
        name: "set_follow_up_mode",
        mutating: true,
    },
    CommandSpec {
        name: "set_auto_compaction",
        mutating: true,
    },
    CommandSpec {
        name: "set_auto_retry",
        mutating: true,
    },
    CommandSpec {
        name: "compact",
        mutating: true,
    },
    CommandSpec {
        name: "refine",
        mutating: true,
    },
    CommandSpec {
        name: "abort_compaction",
        mutating: true,
    },
    CommandSpec {
        name: "abort_branch_summary",
        mutating: true,
    },
    CommandSpec {
        name: "abort_retry",
        mutating: true,
    },
    CommandSpec {
        name: "execute_bash_and_wait",
        mutating: true,
    },
    CommandSpec {
        name: "reload",
        mutating: true,
    },
    CommandSpec {
        name: "new_session",
        mutating: true,
    },
    CommandSpec {
        name: "switch_session",
        mutating: true,
    },
    CommandSpec {
        name: "fork",
        mutating: true,
    },
    CommandSpec {
        name: "navigate_tree",
        mutating: true,
    },
    CommandSpec {
        name: "import_jsonl",
        mutating: true,
    },
    CommandSpec {
        name: "export_html",
        mutating: true,
    },
    CommandSpec {
        name: "export_jsonl",
        mutating: true,
    },
    CommandSpec {
        name: "set_session_name",
        mutating: true,
    },
    CommandSpec {
        name: "get_rlm_max_depth_status",
        mutating: false,
    },
    CommandSpec {
        name: "set_rlm_max_depth",
        mutating: true,
    },
    CommandSpec {
        name: "rename_saved_session",
        mutating: true,
    },
    CommandSpec {
        name: "delete_saved_session",
        mutating: true,
    },
    CommandSpec {
        name: "get_session_context",
        mutating: false,
    },
    CommandSpec {
        name: "get_session_tree",
        mutating: false,
    },
    CommandSpec {
        name: "get_user_messages_for_forking",
        mutating: false,
    },
    CommandSpec {
        name: "get_last_assistant_text",
        mutating: false,
    },
    CommandSpec {
        name: "get_system_prompt",
        mutating: false,
    },
    CommandSpec {
        name: "get_tool_definition",
        mutating: false,
    },
    CommandSpec {
        name: "set_session_entry_label",
        mutating: true,
    },
    CommandSpec {
        name: "extension_ui_response",
        mutating: true,
    },
    CommandSpec {
        name: "prepare_update_restart",
        mutating: true,
    },
    CommandSpec {
        name: "retry_worker",
        mutating: true,
    },
    CommandSpec {
        name: "restart",
        mutating: true,
    },
    CommandSpec {
        name: "shutdown",
        mutating: true,
    },
];

pub(crate) const OUTBOUND_TYPES: &[&str] = &[
    "response",
    "session_list_progress",
    "session_list_item",
    "daemon_hello",
    "daemon_closing",
    "heartbeats_changed",
    "session_event",
    "side_question_event",
    "session_status",
    "session_replaced",
    "session_resynced",
    "session_attached",
    "session_snapshot_begin",
    "session_snapshot_chunk",
    "session_snapshot_end",
    "session_snapshot_failed",
    "session_detached",
    "session_closed",
    "extension_ui_request",
    "extension_error",
];

pub(crate) fn command(name: &str) -> Option<CommandSpec> {
    COMMANDS
        .iter()
        .copied()
        .find(|command| command.name == name)
}

pub(crate) fn deadline(name: &str) -> DeadlineClass {
    match name {
        "abort" | "detach" | "ack_result" => DeadlineClass::Immediate,
        "prompt_and_wait"
        | "wait_for_idle"
        | "wait_for_headless_completion"
        | "execute_bash_and_wait" => DeadlineClass::Completion,
        name if command(name).is_some_and(|spec| spec.mutating) => DeadlineClass::Interactive,
        _ => DeadlineClass::Short,
    }
}

pub(crate) fn compatibility(name: &str) -> Compatibility {
    match name {
        "get_rlm_max_depth_status" | "set_rlm_max_depth" => Compatibility::schema(11),
        "prompt" | "prompt_and_wait" | "steer" | "follow_up" | "resume_queue" => {
            Compatibility::capability("session_input_admission")
        }
        "cancel_prompt_admission" => {
            Compatibility::schema_and_capability(8, "prompt_admission_cancellation")
        }
        "complete_owned_session" | "promote_owned_session" => {
            Compatibility::capability("client_owned_sessions")
        }
        "delete_rlm_subagent" => Compatibility::capability("delete_rlm_subagent"),
        "get_rlm_children" => {
            Compatibility::schema_and_capability(17, "authoritative_child_roster")
        }
        "replace_acp_mcp_servers" => Compatibility::schema_and_capability(22, "acp_mcp_servers"),
        "get_model_catalog" => Compatibility::capability("model_catalog"),
        "mutate_queued_message" => {
            Compatibility::schema_and_capability(15, "queue_message_mutation")
        }
        "acquire_session_input_pause" | "release_session_input_pause" => {
            Compatibility::schema_and_capability(19, "session_input_pause")
        }
        "heartbeats_list" => Compatibility::capability("heartbeat_catalog"),
        "heartbeat_manage" => Compatibility::capability("heartbeat_management"),
        _ => Compatibility::LEGACY,
    }
}

pub(crate) fn recognizes_outbound(name: &str) -> bool {
    OUTBOUND_TYPES.contains(&name)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{COMMANDS, OUTBOUND_TYPES, PROTOCOL_VERSION, SCHEMA_REVISION};

    #[test]
    fn manifest_matches_pinned_prime_agent_inventory() {
        let command_names = COMMANDS
            .iter()
            .map(|command| command.name)
            .collect::<HashSet<_>>();
        let outbound_names = OUTBOUND_TYPES.iter().copied().collect::<HashSet<_>>();

        assert_eq!((PROTOCOL_VERSION, SCHEMA_REVISION), (7, 22));
        assert_eq!((COMMANDS.len(), command_names.len()), (102, 102));
        assert_eq!((OUTBOUND_TYPES.len(), outbound_names.len()), (20, 20));
    }
}

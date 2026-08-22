use std::collections::BTreeSet;
use std::env;
use std::process::Command;

const MANIFEST: &str = include_str!("../src/manifest.rs");
const PROTOCOL_PATH: &str = "packages/coding-agent/src/modes/daemon/daemon-protocol.ts";

fn main() -> Result<(), String> {
    let checkout = env::args()
        .nth(1)
        .ok_or_else(|| "usage: check_protocol_contract <prime-agent-checkout>".to_owned())?;
    let commit = quoted_value(MANIFEST, "SOURCE_COMMIT")?;
    let output = Command::new("git")
        .args([
            "-C",
            &checkout,
            "show",
            &format!("{commit}:{PROTOCOL_PATH}"),
        ])
        .output()
        .map_err(|error| format!("could not run git: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
    }
    let source = String::from_utf8(output.stdout)
        .map_err(|_| "Prime Agent protocol source was not UTF-8".to_owned())?;

    compare_constant(
        &source,
        "DAEMON_PROTOCOL_VERSION",
        MANIFEST,
        "PROTOCOL_VERSION",
    )?;
    compare_constant(
        &source,
        "DAEMON_SCHEMA_REVISION",
        MANIFEST,
        "SCHEMA_REVISION",
    )?;
    let upstream_commands = object_keys(
        &source,
        "export const DAEMON_COMMAND_COMPATIBILITY = {",
        "} as const satisfies Record<DaemonCommandName",
    )?;
    let checked_commands = manifest_command_names(MANIFEST)?;
    compare_set("commands", &upstream_commands, &checked_commands)?;
    let upstream_outbound = object_keys(
        &source,
        "export const DAEMON_OUTBOUND_COMPATIBILITY = {",
        "} as const satisfies Record<DaemonOutbound",
    )?;
    let checked_outbound = manifest_outbound_names(MANIFEST)?;
    compare_set("outbound records", &upstream_outbound, &checked_outbound)?;
    for required in [
        "command.recoveryConfig !== undefined",
        "command.config?.telemetryDisabled !== undefined",
        "command.admissionId !== undefined",
        "command.waitForRlmQuiescence === true",
        "command.cancelOwned === true",
    ] {
        if !source.contains(required) {
            return Err(format!("conditional compatibility changed near {required}"));
        }
    }
    println!(
        "Prime Agent {commit} matches {} commands and {} outbound records",
        upstream_commands.len(),
        upstream_outbound.len()
    );
    Ok(())
}

fn compare_constant(
    source: &str,
    source_name: &str,
    manifest: &str,
    manifest_name: &str,
) -> Result<(), String> {
    let upstream = numeric_value(source, source_name)?;
    let checked = numeric_value(manifest, manifest_name)?;
    if upstream == checked {
        Ok(())
    } else {
        Err(format!(
            "{source_name} is {upstream}, but {manifest_name} is {checked}"
        ))
    }
}

fn numeric_value(source: &str, name: &str) -> Result<u32, String> {
    let line = source
        .lines()
        .find(|line| {
            line.contains(&format!("{name}: u32 =")) || line.contains(&format!("{name} ="))
        })
        .ok_or_else(|| format!("could not find {name}"))?;
    line.split('=')
        .nth(1)
        .and_then(|value| value.trim().trim_end_matches(';').parse().ok())
        .ok_or_else(|| format!("could not parse {name}"))
}

fn quoted_value<'a>(source: &'a str, name: &str) -> Result<&'a str, String> {
    let line = source
        .lines()
        .find(|line| line.contains(name))
        .ok_or_else(|| format!("could not find {name}"))?;
    line.split('"')
        .nth(1)
        .ok_or_else(|| format!("could not parse {name}"))
}

fn object_keys(source: &str, start: &str, end: &str) -> Result<BTreeSet<String>, String> {
    let body = section(source, start, end)?;
    Ok(body
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (key, _) = line.split_once(':')?;
            (!key.is_empty()
                && key
                    .bytes()
                    .all(|byte| byte == b'_' || byte.is_ascii_alphanumeric()))
            .then(|| key.to_owned())
        })
        .collect())
}

fn manifest_command_names(source: &str) -> Result<BTreeSet<String>, String> {
    let body = section(source, "pub(crate) const COMMANDS", "];")?;
    Ok(body
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            line.strip_prefix("name: \"")
                .and_then(|value| value.strip_suffix("\","))
                .map(str::to_owned)
        })
        .collect())
}

fn manifest_outbound_names(source: &str) -> Result<BTreeSet<String>, String> {
    let body = section(source, "pub(crate) const OUTBOUND_TYPES", "];")?;
    Ok(body
        .lines()
        .filter_map(|line| {
            line.trim()
                .strip_prefix('"')
                .and_then(|value| value.strip_suffix("\","))
                .map(str::to_owned)
        })
        .collect())
}

fn section<'a>(source: &'a str, start: &str, end: &str) -> Result<&'a str, String> {
    let (_, tail) = source
        .split_once(start)
        .ok_or_else(|| format!("could not find section {start}"))?;
    let (body, _) = tail
        .split_once(end)
        .ok_or_else(|| format!("could not find end of section {start}"))?;
    Ok(body)
}

fn compare_set(
    label: &str,
    upstream: &BTreeSet<String>,
    checked: &BTreeSet<String>,
) -> Result<(), String> {
    if upstream == checked {
        return Ok(());
    }
    let missing = upstream.difference(checked).cloned().collect::<Vec<_>>();
    let extra = checked.difference(upstream).cloned().collect::<Vec<_>>();
    Err(format!(
        "{label} differ. missing {missing:?}, extra {extra:?}"
    ))
}

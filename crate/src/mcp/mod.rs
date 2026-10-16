//! The agent surface: the same comparison over the Model Context
//! Protocol on stdio, so a model can ask whether the dotenv files agree
//! rather than be handed them and diff the key names itself.
//!
//! Two rules the family's MCP surfaces established:
//!
//! - **A negative answer is not an error.** A tree whose files disagree
//!   comes back as an ordinary result — `ok` reports that the check
//!   ran, never that the answer was yes. Only a malformed question is a
//!   protocol error.
//! - **Refusals speak the caller's vocabulary.** An MCP caller has no
//!   command line, so no message here mentions a flag.
//!
//! Read-only by construction: nothing on this surface writes, so unlike
//! pixelactions there is no consent gate to design.

pub(crate) mod compare;

use std::io::{BufRead, Write};
use std::process::ExitCode;

use serde_json::{Value, json};

use crate::discover::DiscoverOptions;
use crate::scan::{self, ScanOptions};

const PROTOCOL_VERSION: &str = "2025-06-18";

/// JSON-RPC error codes, from the spec.
const INVALID_PARAMS: i64 = -32602;
const METHOD_NOT_FOUND: i64 = -32601;

pub(crate) fn serve() -> ExitCode {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else {
            return ExitCode::from(2);
        };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            // A frame that is not JSON has no id to answer against;
            // dropping it is the only honest option.
            continue;
        };
        let Some(response) = handle(&request) else {
            continue; // a notification: no reply
        };
        if writeln!(stdout, "{response}").is_err() || stdout.flush().is_err() {
            return ExitCode::from(2);
        }
    }
    ExitCode::SUCCESS
}

fn handle(request: &Value) -> Option<Value> {
    let id = request.get("id").cloned();
    let method = request.get("method")?.as_str()?;
    // Notifications carry no id and get no reply.
    id.as_ref()?;

    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "envsync-le", "version": env!("CARGO_PKG_VERSION") },
        })),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(request.get("params")),
        "ping" => Ok(json!({})),
        other => Err((
            METHOD_NOT_FOUND,
            format!("this server does not implement {other}"),
        )),
    };

    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message },
        }),
    })
}

fn tool_definitions() -> Value {
    json!([
        compare::definition(),
        {
            "name": "envsync_le_check",
            "description": "Compare the dotenv files in a directory and report which keys are \
                            missing from which. Reads the filesystem; never writes to it, and \
                            never reads a value — only key names are returned, because a dotenv \
                            file is where credentials live.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "the directory to compare" },
                    "template": {
                        "type": "string",
                        "description": "Compare every file against this one, relative to the \
                                        directory. Without it the reference is the union of all \
                                        keys and nothing can be extra.",
                    },
                    "caseSensitive": {
                        "type": "boolean",
                        "default": true,
                        "description": "Whether key names are compared case-sensitively.",
                    },
                    "exclude": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Glob patterns for files to skip.",
                    },
                    "hidden": {
                        "type": "boolean",
                        "default": false,
                        "description": "Descend hidden directories too.",
                    },
                    "ignored": {
                        "type": "boolean",
                        "default": true,
                        "description": "Accepted and always on: a dotenv file is git-ignored \
                                        by design, so honouring the ignore rules would compare \
                                        the committed example against nothing.",
                    },
                },
                "required": ["path"],
            },
        },
    ])
}

/// Protocol failures (no tool named, an unknown tool) are JSON-RPC
/// errors; a tool that fails on its arguments returns a result carrying
/// `isError`, so a model reads the reason and reacts rather than
/// concluding the server is broken. Same rule as the npm server.
fn call_tool(params: Option<&Value>) -> Result<Value, (i64, String)> {
    let params = params.ok_or((INVALID_PARAMS, "no tool call was supplied".to_string()))?;
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or((INVALID_PARAMS, "the tool call named no tool".to_string()))?;
    let arguments = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    match name {
        "compare_env_files" => Ok(match compare::run(&arguments) {
            Ok(result) => tool_result(&result),
            Err(message) => tool_failure(&message),
        }),
        "envsync_le_check" => Ok(match check_tool(&arguments) {
            Ok(result) => tool_result(&result),
            Err(message) => tool_failure(&message),
        }),
        other => Err((
            INVALID_PARAMS,
            format!("this server offers no tool named {other}"),
        )),
    }
}

fn check_tool(arguments: &Value) -> Result<Value, String> {
    let path = arguments
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| "no directory was supplied to compare".to_string())?;
    let flag = |name: &str| {
        arguments
            .get(name)
            .and_then(Value::as_bool)
            .unwrap_or(false)
    };

    let options = ScanOptions {
        template: arguments
            .get("template")
            .and_then(Value::as_str)
            .map(str::to_string),
        ignore_case: arguments
            .get("caseSensitive")
            .and_then(Value::as_bool)
            .is_some_and(|sensitive| !sensitive),
        discover: DiscoverOptions {
            hidden: flag("hidden"),
            // Never the ignore rules, whatever `ignored` says. Honouring them
            // found only the committed `.env.example` in the usual repository
            // and answered `in-sync` — the command line's old bug, left here
            // after `--no-ignore` became its default.
            respect_ignore: false,
            exclude: arguments
                .get("exclude")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
        },
    };

    let report = scan::scan(std::path::Path::new(path), &options)?;
    let diagnostics: Vec<Value> = report
        .diagnostics
        .iter()
        .map(|diagnostic| {
            warning(
                &diagnostic.code,
                &format!("{}: {}", diagnostic.file, diagnostic.message),
            )
        })
        .collect();
    let count = report.files.len();
    let data = serde_json::to_value(&report).expect("a report serializes");

    Ok(envelope(
        "envsync_le_check",
        &data,
        count,
        &diagnostics,
        false,
    ))
}

/// The one result shape every tool returns, matching the npm server's
/// envelope field for field: `{ ok, data, diagnostics, meta }`.
///
/// **`ok` reports whether the check ran, not whether the answer is
/// yes.** A file full of broken paths is the answer, not a failure to
/// produce one — conflating the two would have a model report a broken
/// tool when what it actually learned is that the paths are wrong.
pub(crate) fn envelope(
    tool: &str,
    data: &Value,
    count: usize,
    diagnostics: &[Value],
    truncated: bool,
) -> Value {
    let ok = !diagnostics
        .iter()
        .any(|diagnostic| diagnostic["severity"].as_str() == Some("error"));
    json!({
        "ok": ok,
        "data": data,
        "diagnostics": diagnostics,
        "meta": { "tool": tool, "count": count, "truncated": truncated },
    })
}

/// An MCP tool result: the envelope as text (what a model reads) and
/// the same envelope structured. Identical to what the npm server
/// emits, so a caller diffing the two servers finds nothing.
fn tool_result(envelope: &Value) -> Value {
    let text = serde_json::to_string_pretty(envelope).expect("an envelope serializes");
    json!({
        "content": [{ "type": "text", "text": text }],
        "structuredContent": envelope,
        "isError": false,
    })
}

fn warning(code: &str, message: &str) -> Value {
    json!({ "severity": "warning", "code": code, "message": message })
}

/// The tool could not run on the arguments given. `isError` so a model
/// reads the message and corrects itself.
fn tool_failure(message: &str) -> Value {
    json!({
        "content": [{ "type": "text", "text": message }],
        "isError": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn request(method: &str, params: &Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params })
    }

    fn call(name: &str, arguments: &Value) -> Value {
        handle(&request(
            "tools/call",
            &json!({ "name": name, "arguments": arguments }),
        ))
        .expect("a reply")
    }

    #[test]
    fn initialize_answers_with_the_protocol_version() {
        let response = handle(&request("initialize", &json!({}))).expect("a reply");
        assert_eq!(response["result"]["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(response["result"]["serverInfo"]["name"], "envsync-le");
    }

    #[test]
    fn tools_list_offers_both_tools() {
        let response = handle(&request("tools/list", &json!({}))).expect("a reply");
        let tools = response["result"]["tools"].as_array().expect("tools");
        let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
        assert_eq!(names, ["compare_env_files", "envsync_le_check"]);
    }

    #[test]
    fn a_notification_gets_no_reply() {
        let notification = json!({ "jsonrpc": "2.0", "method": "initialized" });
        assert!(handle(&notification).is_none());
    }

    #[test]
    fn an_unknown_method_is_a_protocol_error() {
        let response = handle(&request("does/not/exist", &json!({}))).expect("a reply");
        assert_eq!(response["error"]["code"], METHOD_NOT_FOUND);
    }

    #[test]
    fn an_unknown_tool_is_a_protocol_error() {
        let response = call("numbers_le_translate", &json!({}));
        assert_eq!(response["error"]["code"], INVALID_PARAMS);
    }

    /// A bad argument is the tool failing on what it was given, not the
    /// server breaking — so it comes back as a result carrying isError.
    #[test]
    fn a_missing_argument_is_a_tool_failure_not_a_protocol_error() {
        let response = call("envsync_le_check", &json!({}));
        assert!(response.get("error").is_none(), "{response}");
        assert_eq!(response["result"]["isError"], true);
        assert!(
            response["result"]["content"][0]["text"]
                .as_str()
                .expect("a message")
                .contains("no directory")
        );
    }

    #[test]
    fn the_shared_tool_is_offered_and_answers() {
        let response = call(
            "compare_env_files",
            &json!({ "files": [
                { "path": ".env", "content": "A=1" },
                { "path": ".env.production", "content": "A=1\nB=2" },
            ]}),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(envelope["meta"]["tool"], "compare_env_files");
        assert_eq!(envelope["data"]["status"], "missing-keys");
        assert_eq!(envelope["data"]["missingKeys"][0]["keys"][0], "B");
        assert_eq!(response["result"]["isError"], false);
    }

    /// The property the whole crate rests on, on the surface a model
    /// actually calls.
    #[test]
    fn the_shared_tool_never_returns_a_value() {
        let response = call(
            "compare_env_files",
            &json!({ "files": [
                { "path": ".env", "content": "SECRET=hunter2" },
                { "path": ".env.example", "content": "SECRET=\nEXTRA=" },
            ]}),
        );
        let rendered = serde_json::to_string(&response).expect("serializes");
        assert!(!rendered.contains("hunter2"), "{rendered}");
        assert!(rendered.contains("EXTRA"), "the key name is the finding");
    }

    /// The shared tool reaches no filesystem — the property that lets an
    /// agent call it anywhere, and it must not regress.
    #[test]
    fn the_shared_tool_needs_no_filesystem() {
        let response = call(
            "compare_env_files",
            &json!({ "files": [{ "path": "/definitely/not/here/.env", "content": "A=1" }]}),
        );
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(
            response["result"]["structuredContent"]["data"]["status"],
            "in-sync"
        );
    }

    /// Files that agree are an ordinary result, not an empty one.
    #[test]
    fn matching_files_are_an_ordinary_result() {
        let response = call(
            "compare_env_files",
            &json!({ "files": [
                { "path": ".env", "content": "A=1" },
                { "path": ".env.production", "content": "A=2" },
            ]}),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(envelope["ok"], true);
        assert_eq!(envelope["data"]["status"], "in-sync");
    }

    #[test]
    fn the_check_tool_reports_what_it_found() {
        let tree = TempTree::new("mcp-check");
        tree.write(".env", "A=1");
        tree.write(".env.production", "A=1\nB=2");
        let response = call(
            "envsync_le_check",
            &json!({ "path": tree.path().to_string_lossy() }),
        );
        let envelope = &response["result"]["structuredContent"];
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(envelope["data"]["status"], "missing-keys");
        assert_eq!(envelope["data"]["summary"]["files"], 2);
    }

    /// **Regression.** The usual repository: `.env.example` committed,
    /// `.env` git-ignored. Honouring the ignore rules here compared the
    /// example against nothing and answered `in-sync`.
    #[test]
    fn the_check_tool_compares_a_gitignored_dotenv() {
        let tree = TempTree::new("mcp-gitignored");
        tree.mkdir(".git");
        tree.write(".gitignore", ".env\n");
        tree.write(".env.example", "A=\nB=");
        tree.write(".env", "A=1");
        let path = tree.path().to_string_lossy().to_string();
        for arguments in [
            json!({ "path": path }),
            json!({ "path": path, "ignored": false }),
            json!({ "path": path, "ignored": true }),
        ] {
            let response = call("envsync_le_check", &arguments);
            let data = &response["result"]["structuredContent"]["data"];
            assert_eq!(data["summary"]["files"], 2, "{arguments}");
            assert_eq!(data["status"], "missing-keys", "{arguments}");
        }
    }

    /// A template is what makes an extra key possible at all.
    #[test]
    fn the_check_tool_honours_a_template() {
        let tree = TempTree::new("mcp-template");
        tree.write(".env.example", "A=");
        tree.write(".env", "A=1\nLOCAL=2");
        let path = tree.path().to_string_lossy().to_string();

        let auto = call("envsync_le_check", &json!({ "path": path }));
        let extras = &auto["result"]["structuredContent"]["data"]["extraKeys"];
        assert_eq!(extras.as_array().expect("a list").len(), 0);

        let templated = call(
            "envsync_le_check",
            &json!({ "path": path, "template": ".env.example" }),
        );
        let envelope = &templated["result"]["structuredContent"];
        assert_eq!(envelope["data"]["extraKeys"][0]["keys"][0], "LOCAL");
    }

    /// Refusals speak the caller's vocabulary: an MCP caller has no
    /// command line, so no message may name a flag.
    #[test]
    fn no_message_mentions_a_command_line_flag() {
        let definitions = serde_json::to_string(&tool_definitions()).expect("serializes");
        assert!(!definitions.contains("--"), "{definitions}");

        let tree = TempTree::new("mcp-vocabulary");
        tree.write(".env", "A=1\n");
        for arguments in [
            json!({}),
            json!({ "paths": [] }),
            json!({ "path": "/no/such/place-xyz" }),
            json!({ "path": tree.path().to_string_lossy(), "values": true }),
        ] {
            let rendered =
                serde_json::to_string(&call("envsync_le_check", &arguments)).expect("serializes");
            assert!(!rendered.contains("--"), "{rendered}");
        }
    }

    /// Every tool returns the same envelope, so a caller writes one
    /// reader for all of them and for both servers.
    #[test]
    fn every_tool_returns_the_same_envelope_shape() {
        let tree = TempTree::new("mcp-envelope");
        tree.write(".env", "A=1");
        let results = [
            call(
                "compare_env_files",
                &json!({ "files": [{ "path": ".env", "content": "A=1" }] }),
            ),
            call(
                "envsync_le_check",
                &json!({ "path": tree.path().to_string_lossy() }),
            ),
        ];
        for result in results {
            let envelope = &result["result"]["structuredContent"];
            assert!(envelope["ok"].is_boolean(), "{envelope}");
            assert!(!envelope["data"].is_null(), "{envelope}");
            assert!(envelope["diagnostics"].is_array(), "{envelope}");
            assert!(envelope["meta"]["tool"].is_string(), "{envelope}");
            assert!(envelope["meta"]["count"].is_number(), "{envelope}");
            assert!(envelope["meta"]["truncated"].is_boolean(), "{envelope}");
        }
    }
}

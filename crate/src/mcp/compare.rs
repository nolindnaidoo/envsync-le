//! `compare_env_files` — the tool **both** servers offer.
//!
//! The npm server (`src/mcp/tools.ts`) and this one are meant to be the
//! same tool, not two similar ones: same schema, same envelope,
//! byte-identical output. `fixtures/mcp-compare-env-files.json` runs
//! against both, so changing one without the other fails a build.
//!
//! It takes file *contents* directly and touches no filesystem. An agent
//! already has file-read tools; duplicating them here would add a
//! path-traversal surface for no capability. The tool that needs a
//! filesystem is `envsync_le_check`.
//!
//! **Only key names come back.** A dotenv file is where credentials
//! live, and the answer does not need them — the parity script greps
//! the corpus for a value and fails if it finds one.

use serde_json::{Value, json};

use crate::detect::compare::{EnvFile, Mode, Options, compare};
use crate::detect::heuristics::detect_file_type;
use crate::detect::parser::parse;

const DEFAULT_MAX_RESULTS: usize = 500;
const MAX_MAX_RESULTS: usize = 5000;

pub(crate) fn definition() -> Value {
    json!({
        "name": "compare_env_files",
        "description": "Compare dotenv files and report which keys are missing from which file, \
                        and which are extra relative to a template. Takes file contents \
                        directly. Only key NAMES are returned — never values — because a dotenv \
                        file is where credentials live and the answer does not need them. In \
                        \"auto\" mode the reference is the union of all keys, so nothing can be \
                        extra; \"template\" mode compares every file against one named template.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "files": {
                    "type": "array",
                    "minItems": 1,
                    "description": "The dotenv files to compare.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Path or filename, e.g. \".env.example\". Used to \
                                                classify the file and to label mismatches.",
                            },
                            "content": { "type": "string", "description": "The file contents." },
                        },
                        "required": ["path", "content"],
                        "additionalProperties": false,
                    },
                },
                "mode": {
                    "type": "string",
                    "enum": ["auto", "template"],
                    "default": "auto",
                    "description": "\"auto\" compares against the union of all keys; \
                                    \"template\" compares against one file.",
                },
                "templatePath": {
                    "type": "string",
                    "description": "Which file is the template. Required when mode is \
                                    \"template\".",
                },
                "caseSensitive": {
                    "type": "boolean",
                    "default": true,
                    "description": "Whether key names are compared case-sensitively.",
                },
                "maxResults": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_MAX_RESULTS,
                    "default": DEFAULT_MAX_RESULTS,
                    "description": format!(
                        "Cap on returned key mismatches (default {DEFAULT_MAX_RESULTS}). \
                         meta.truncated reports whether any were dropped."
                    ),
                },
            },
            "required": ["files"],
            "additionalProperties": false,
        },
    })
}

pub(crate) fn run(arguments: &Value) -> Result<Value, String> {
    let files = read_files(arguments)?;
    let max_results = read_max_results(arguments)?;

    let template = arguments
        .get("templatePath")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mode = match (arguments.get("mode").and_then(Value::as_str), &template) {
        (Some("template"), Some(path)) => Mode::Template(path),
        _ => Mode::Auto,
    };

    let mut report = compare(
        &files,
        Options {
            mode,
            case_sensitive: arguments
                .get("caseSensitive")
                .and_then(Value::as_bool)
                .unwrap_or(true),
        },
    );

    // The `truncated` flag matters more than the cap: a silently
    // incomplete answer is wrong in the most expensive way, and this is
    // a tool whose whole job is telling you what is absent.
    let total = report.missing_keys.len() + report.extra_keys.len();
    let truncated = total > max_results;
    if truncated {
        report.missing_keys.truncate(max_results);
        let remaining = max_results.saturating_sub(report.missing_keys.len());
        report.extra_keys.truncate(remaining);
    }

    // A file that did not parse cleanly makes the answer partial, and an
    // unsuccessful envelope is how a model is told so.
    let diagnostics: Vec<Value> = files
        .iter()
        .flat_map(|file| {
            file.errors.iter().map(|error| {
                json!({
                    "severity": "error",
                    "code": error.kind,
                    "message": format!("{}: {}", file.path, error.message),
                })
            })
        })
        .collect();

    // The tool's own shape, not the comparator's. The npm server counts
    // a file's keys as `keyCount` and carries no `errors` — that field
    // is vestigial in the comparator and belongs to the detector — so
    // the data object is built rather than serialized wholesale.
    let count = report.missing_keys.len() + report.extra_keys.len();
    let data = json!({
        "status": report.status,
        "files": report.files.iter().map(|file| json!({
            "path": file.path,
            "type": file.kind,
            "keyCount": file.keys,
        })).collect::<Vec<_>>(),
        "missingKeys": report.missing_keys,
        "extraKeys": report.extra_keys,
    });
    Ok(super::envelope(
        "compare_env_files",
        &data,
        count,
        &diagnostics,
        truncated,
    ))
}

fn read_files(arguments: &Value) -> Result<Vec<EnvFile>, String> {
    let invalid =
        "files is required and must be a non-empty array of { path, content }".to_string();
    let items = arguments
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid.clone())?;
    if items.is_empty() {
        return Err(invalid);
    }

    items
        .iter()
        .map(|item| {
            let path = item
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| invalid.clone())?;
            let content = item
                .get("content")
                .and_then(Value::as_str)
                .ok_or_else(|| invalid.clone())?;
            let parsed = parse(content);
            Ok(EnvFile {
                kind: detect_file_type(path),
                path: path.to_string(),
                keys: parsed.keys,
                errors: parsed.errors,
            })
        })
        .collect()
}

/// Clamp quietly, reject loudly — the npm server's asymmetry.
fn read_max_results(arguments: &Value) -> Result<usize, String> {
    let Some(raw) = arguments.get("maxResults") else {
        return Ok(DEFAULT_MAX_RESULTS);
    };
    let invalid = "maxResults must be a positive integer".to_string();
    let value = raw.as_u64().ok_or(invalid.clone())?;
    if value < 1 {
        return Err(invalid);
    }
    Ok(usize::try_from(value)
        .unwrap_or(MAX_MAX_RESULTS)
        .min(MAX_MAX_RESULTS))
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
    use crate::detect::corpus::document;

    const CASES: &str = include_str!("../../fixtures/mcp-compare-env-files.json");

    #[derive(Debug, Deserialize)]
    struct Case {
        name: String,
        files: Option<Vec<String>>,
        arguments: Value,
        expected: Option<Value>,
        #[serde(rename = "expectedError")]
        expected_error: Option<String>,
    }

    #[test]
    fn every_shared_case_answers_identically() {
        let cases: Vec<Case> = serde_json::from_str(CASES).expect("the corpus is valid JSON");
        assert!(!cases.is_empty(), "the corpus is empty");

        for case in cases {
            let mut arguments = case.arguments.clone();
            if let Some(names) = &case.files {
                arguments["files"] = Value::Array(
                    names
                        .iter()
                        .map(|name| json!({ "path": name, "content": document(name) }))
                        .collect(),
                );
            }

            match (case.expected, case.expected_error) {
                (_, Some(expected)) => {
                    assert_eq!(
                        run(&arguments).expect_err(&case.name),
                        expected,
                        "{}",
                        case.name
                    );
                }
                (Some(expected), None) => {
                    assert_eq!(
                        run(&arguments).expect(&case.name),
                        expected,
                        "{}",
                        case.name
                    );
                }
                (None, None) => panic!("{} pins neither a result nor an error", case.name),
            }
        }
    }

    #[test]
    fn the_tool_name_is_pinned() {
        assert_eq!(definition()["name"], "compare_env_files");
    }

    /// The property this crate rests on, asserted on the surface a model
    /// actually calls.
    #[test]
    fn no_value_ever_reaches_the_answer() {
        let result = run(&json!({
            "files": [
                { "path": ".env", "content": "SECRET=hunter2\nURL=postgres://user:pw@host" },
                { "path": ".env.example", "content": "SECRET=\nURL=\nEXTRA=" },
            ]
        }))
        .expect("a result");
        let rendered = serde_json::to_string(&result).expect("serializes");
        assert!(!rendered.contains("hunter2"), "{rendered}");
        assert!(!rendered.contains("postgres"), "{rendered}");
        assert!(rendered.contains("EXTRA"), "the key name is the finding");
    }

    /// The schema may not offer a way to read values either.
    #[test]
    fn the_schema_offers_no_way_to_ask_for_values() {
        let definition = definition();
        let properties = definition["inputSchema"]["properties"]
            .as_object()
            .expect("properties");
        for absent in ["values", "includeValues", "compareValues"] {
            assert!(!properties.contains_key(absent), "{absent} is offered");
        }
    }

    #[test]
    fn a_missing_files_argument_is_refused() {
        let error = run(&json!({})).expect_err("a refusal");
        assert!(error.contains("files is required"), "{error}");
        assert!(run(&json!({ "files": [] })).is_err());
    }

    #[test]
    fn a_fractional_cap_is_refused() {
        let error = run(&json!({
            "files": [{ "path": ".env", "content": "A=1" }],
            "maxResults": 1.5
        }))
        .expect_err("a refusal");
        assert_eq!(error, "maxResults must be a positive integer");
    }
}

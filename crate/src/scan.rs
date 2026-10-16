//! One comparison end to end — the only path either surface calls.
//!
//! `cli.rs` and `mcp/` both come through here, so a rule can only be
//! written once. `tests/contracts.rs` asserts the two agree.
//!
//! The report is one object for the whole run, not one line per file.
//! The answer here is about the *set* of files, which is the difference
//! between this crate and the extractors in the family.

use std::path::{Path as StdPath, PathBuf};

use serde::Serialize;

use crate::detect::compare::{self, EnvFile, Mismatch, Mode, Options, Status};
use crate::discover::{self, DiscoverOptions};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Diagnostic {
    pub(crate) severity: String,
    pub(crate) code: String,
    pub(crate) file: String,
    pub(crate) message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub(crate) struct Summary {
    pub(crate) files: usize,
    pub(crate) missing: usize,
    pub(crate) extra: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct Report {
    pub(crate) status: Status,
    pub(crate) mode: String,
    pub(crate) files: Vec<compare::FileSummary>,
    #[serde(rename = "missingKeys")]
    pub(crate) missing_keys: Vec<Mismatch>,
    #[serde(rename = "extraKeys")]
    pub(crate) extra_keys: Vec<Mismatch>,
    pub(crate) diagnostics: Vec<Diagnostic>,
    pub(crate) summary: Summary,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ScanOptions {
    pub(crate) template: Option<String>,
    pub(crate) ignore_case: bool,
    pub(crate) discover: DiscoverOptions,
}

/// Compare the dotenv files under `root`.
pub(crate) fn scan(root: &StdPath, options: &ScanOptions) -> Result<Report, String> {
    let paths = discover::discover(root, &options.discover)?;
    // A file named in place of a directory is named the way `--file` names
    // one. Relative to itself it was the empty path, so the report listed a
    // file called `""` and no template could match it.
    if root.is_file() {
        return Ok(scan_paths(&paths, StdPath::new("."), options));
    }
    Ok(scan_paths(&paths, root, options))
}

/// Compare exactly these files, in the order given.
pub(crate) fn scan_paths(paths: &[PathBuf], root: &StdPath, options: &ScanOptions) -> Report {
    // One unreadable file does not abort the comparison of the rest —
    // a `.env.bak` that is not text says nothing about whether the real
    // ones agree. It is named in the diagnostics so the answer is not
    // quietly narrower than it looks.
    let mut files = Vec::new();
    let mut skipped = Vec::new();
    for path in paths {
        match discover::read(path, root) {
            Ok(file) => files.push(file),
            // Named the same way a file that *was* read is named:
            // relative to the root and with forward slashes. Reaching
            // for `Path::display` here spelled one report two ways —
            // an absolute, platform-native path for the file that was
            // skipped and a relative one for every file beside it.
            Err(reason) => skipped.push((discover::relative_path(path, root), reason)),
        }
    }
    let mut report = report_for(&files, options);
    report
        .diagnostics
        .extend(skipped.into_iter().map(|(file, message)| Diagnostic {
            severity: "warning".to_string(),
            code: "skipped".to_string(),
            file,
            message,
        }));
    report
}

pub(crate) fn report_for(files: &[EnvFile], options: &ScanOptions) -> Report {
    let compared = compare::compare(
        files,
        Options {
            mode: options
                .template
                .as_deref()
                .map_or(Mode::Auto, Mode::Template),
            case_sensitive: !options.ignore_case,
        },
    );

    // A file that does not parse cleanly is a warning naming the file,
    // not a failure of the run. Its keys are still compared: half a
    // dotenv file is still evidence about the half that parsed, and the
    // reader can see that it was only half.
    let diagnostics: Vec<Diagnostic> = files
        .iter()
        .flat_map(|file| {
            file.errors.iter().map(|error| Diagnostic {
                severity: "warning".to_string(),
                code: error.kind.clone(),
                file: file.path.clone(),
                message: error.message.clone(),
            })
        })
        .collect();

    Report {
        summary: Summary {
            files: compared.files.len(),
            missing: compared.missing_keys.len(),
            extra: compared.extra_keys.len(),
        },
        mode: if options.template.is_some() {
            "template".to_string()
        } else {
            "auto".to_string()
        },
        status: compared.status,
        files: compared.files,
        missing_keys: compared.missing_keys,
        extra_keys: compared.extra_keys,
        diagnostics,
    }
}

/// 0 in sync, 1 out of sync, 2 could not answer.
///
/// **This crate has a verdict**, unlike the extractors in the family.
/// The exit code is the product: there is nothing to grep and nothing to
/// pipe onward, and `envsync-le .` in a pipeline is the whole point.
///
/// No files found is 0, not 1. A repository with no dotenv files is not
/// out of sync — there is nothing to be out of sync with, and failing a
/// build over it would be the tool inventing a problem.
pub(crate) fn exit_code(report: &Report, strict: bool) -> u8 {
    if strict && report.diagnostics.iter().any(|d| d.code == "skipped") {
        return 2;
    }
    match report.status {
        Status::InSync | Status::NoFiles => 0,
        Status::MissingKeys | Status::ExtraKeys => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn tree_with(name: &str, files: &[(&str, &str)]) -> TempTree {
        let tree = TempTree::new(name);
        for (path, content) in files {
            tree.write(path, content);
        }
        tree
    }

    #[test]
    fn matching_files_are_in_sync_and_exit_zero() {
        let tree = tree_with(
            "scan-sync",
            &[(".env", "A=1\nB=2"), (".env.production", "A=3\nB=4")],
        );
        let report = scan(tree.path(), &ScanOptions::default()).expect("scans");
        assert_eq!(report.status, Status::InSync);
        assert_eq!(exit_code(&report, false), 0);
    }

    #[test]
    fn a_missing_key_exits_one() {
        let tree = tree_with(
            "scan-missing",
            &[(".env", "A=1"), (".env.production", "A=1\nB=2")],
        );
        let report = scan(tree.path(), &ScanOptions::default()).expect("scans");
        assert_eq!(report.status, Status::MissingKeys);
        assert_eq!(report.summary.missing, 1);
        assert_eq!(exit_code(&report, false), 1);
    }

    /// A repository with no dotenv files is not out of sync. Failing a
    /// build over it would be the tool inventing a problem.
    #[test]
    fn no_files_is_not_a_failure() {
        let tree = tree_with("scan-none", &[("README.md", "nothing here")]);
        let report = scan(tree.path(), &ScanOptions::default()).expect("scans");
        assert_eq!(report.status, Status::NoFiles);
        assert_eq!(exit_code(&report, false), 0);
    }

    #[test]
    fn a_template_makes_extra_keys_possible() {
        let tree = tree_with(
            "scan-template",
            &[(".env.example", "A="), (".env", "A=1\nLOCAL=2")],
        );
        let auto = scan(tree.path(), &ScanOptions::default()).expect("scans");
        assert!(auto.extra_keys.is_empty(), "auto mode has no extras");

        let templated = scan(
            tree.path(),
            &ScanOptions {
                template: Some(".env.example".to_string()),
                ..ScanOptions::default()
            },
        )
        .expect("scans");
        assert_eq!(templated.mode, "template");
        assert_eq!(templated.extra_keys[0].keys, ["LOCAL"]);
        assert_eq!(exit_code(&templated, false), 1);
    }

    #[test]
    fn ignoring_case_can_bring_a_tree_into_sync() {
        let tree = tree_with(
            "scan-case",
            &[
                (".env", "database_url=1"),
                (".env.production", "DATABASE_URL=2"),
            ],
        );
        assert_eq!(
            scan(tree.path(), &ScanOptions::default())
                .expect("scans")
                .status,
            Status::MissingKeys
        );
        let relaxed = scan(
            tree.path(),
            &ScanOptions {
                ignore_case: true,
                ..ScanOptions::default()
            },
        )
        .expect("scans");
        assert_eq!(relaxed.status, Status::InSync);
    }

    /// Half a dotenv file is still evidence about the half that parsed.
    #[test]
    fn a_parse_error_is_a_warning_and_the_keys_still_count() {
        let tree = tree_with(
            "scan-broken",
            &[(".env", "GOOD=1\n2BAD=2"), (".env.production", "GOOD=1")],
        );
        let report = scan(tree.path(), &ScanOptions::default()).expect("scans");
        assert_eq!(report.diagnostics.len(), 1);
        assert_eq!(report.diagnostics[0].severity, "warning");
        assert_eq!(report.diagnostics[0].file, ".env");
        assert_eq!(report.status, Status::InSync, "GOOD is in both");
    }

    /// **Regression.** A file given as the root reported its path as `""`.
    #[test]
    fn a_file_given_as_the_root_keeps_its_name() {
        let tree = tree_with("scan-file-root", &[(".env.production", "A=1")]);
        let file = tree.path().join(".env.production");
        let report = scan(&file, &ScanOptions::default()).expect("scans");
        assert_eq!(report.files[0].path, discover::display(&file));
        assert_eq!(
            report.files[0].kind,
            crate::detect::heuristics::FileType::Production
        );
    }

    #[test]
    fn a_missing_root_is_refused() {
        let tree = TempTree::new("scan-missing-root");
        assert!(scan(&tree.path().join("nope"), &ScanOptions::default()).is_err());
    }

    #[test]
    fn the_report_carries_no_values() {
        let tree = tree_with(
            "scan-values",
            &[(".env", "SECRET=hunter2\nURL=postgres://x")],
        );
        let report = scan(tree.path(), &ScanOptions::default()).expect("scans");
        let rendered = serde_json::to_string(&report).expect("serializes");
        assert!(!rendered.contains("hunter2"), "{rendered}");
        assert!(!rendered.contains("postgres"), "{rendered}");
    }

    #[test]
    fn the_mode_is_named_in_the_report() {
        let tree = tree_with("scan-mode", &[(".env", "A=1")]);
        assert_eq!(
            scan(tree.path(), &ScanOptions::default())
                .expect("scans")
                .mode,
            "auto"
        );
    }
}

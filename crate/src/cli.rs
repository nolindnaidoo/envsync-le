//! The terminal surface.
//!
//! stdout is protocol — **one JSON report for the whole run**, not one
//! line per file, because the answer is about the set of files. It is
//! silent when it is a terminal. stderr is for the human and is a
//! projection of the same report.

use std::io::{IsTerminal, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use crate::detect::compare::Status;
use crate::scan::{self, Report, ScanOptions};

const USAGE: &str = "usage: envsync-le [options] [dir]
       envsync-le [options] --file <path>...
       envsync-le mcp
       envsync-le --version | --help

Compares the dotenv files in a tree and says which keys are missing from
which. Only key NAMES are ever read or reported — a dotenv file is where
credentials live and the answer does not need them.

Two modes that mean different things. Without a template the reference is
the union of every key found, so a key present anywhere must be present
everywhere and nothing can be extra. With one, that file is the contract
and a key it does not have IS extra — which is the question a deploy
actually asks.

One JSON report on stdout when it is piped or redirected, human summary
on stderr.

Options:
  --template <path>    compare every file against this one
  --file <path>        compare exactly these files instead of discovering
  --ignore-case        compare key names case-insensitively
  --exclude <glob>     skip files matching this pattern; repeatable
  --hidden             descend hidden directories too
  --no-ignore          accepted and now the default: a dotenv file is
                       git-ignored by design, so honouring the ignore
                       rules found nothing and reported it as in sync

A file that is not text, or that cannot be opened, is named in the
diagnostics and left out of the comparison rather than aborting it — a
`.env.bak` that is not text says nothing about whether the real ones
agree. --strict turns it back into a failure.

Exit codes: 0 in sync · 1 out of sync · 2 malformed question. Finding no
dotenv files at all is 0 — there is nothing to be out of sync with.";

/// Every flag the parser accepts. Held equal to the flags named in USAGE
/// by a test, and consulted at runtime so the list is what the parser
/// actually honours.
const FLAGS: [&str; 7] = [
    "--template",
    "--strict",
    "--file",
    "--ignore-case",
    "--exclude",
    "--hidden",
    "--no-ignore",
];

#[derive(Debug)]
struct Cli {
    root: PathBuf,
    files: Vec<PathBuf>,
    scan: ScanOptions,
    /// Fail the run if any file could not be read.
    strict: bool,
}

pub(crate) fn run() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();

    if let Some(first) = args.first() {
        match first.as_str() {
            "mcp" => return crate::mcp::serve(),
            "--help" | "-h" => {
                println!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            "--version" | "-V" => {
                println!("envsync-le {}", env!("CARGO_PKG_VERSION"));
                return ExitCode::SUCCESS;
            }
            _ => {}
        }
    }

    match execute(&args) {
        Ok(code) => ExitCode::from(code),
        Err(message) => {
            eprintln!("envsync-le: {message}");
            ExitCode::from(2)
        }
    }
}

fn execute(args: &[String]) -> Result<u8, String> {
    let options = parse(args)?;
    let report = if options.files.is_empty() {
        scan::scan(&options.root, &options.scan)?
    } else {
        scan::scan_paths(&options.files, &options.root, &options.scan)
    };

    let stdout = std::io::stdout();
    let terminal = stdout.is_terminal();
    write_report(&mut stdout.lock(), &report, terminal)
        .map_err(|error| format!("could not write the report: {error}"))?;

    summarise(&report);
    Ok(scan::exit_code(&report, options.strict))
}

/// A terminal gets nothing here. The stderr summary already says every
/// mismatch a person reads, and the JSON beside it on the same screen is
/// the same answer a second time in a form nobody reads by eye. Anything
/// that can parse — a pipe, a file, a subprocess — still gets the
/// report, so no script sees a difference.
fn write_report(out: &mut impl Write, report: &Report, terminal: bool) -> std::io::Result<()> {
    if terminal {
        return Ok(());
    }
    let line = serde_json::to_string(report).expect("a report serializes");
    writeln!(out, "{line}")
}

fn parse(args: &[String]) -> Result<Cli, String> {
    let mut options = Cli {
        strict: false,
        root: PathBuf::from("."),
        files: Vec::new(),
        scan: ScanOptions::default(),
    };
    let mut roots: Vec<PathBuf> = Vec::new();

    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        // Strict parsing, never a silent default: a typo'd `--tempate`
        // that quietly did nothing would compare against the union and
        // report a clean tree that was never checked against its
        // contract.
        if arg.starts_with('-') && !FLAGS.contains(&arg.as_str()) {
            return Err(format!("{arg} is not an option. Try --help."));
        }

        match arg.as_str() {
            "--ignore-case" => options.scan.ignore_case = true,
            "--strict" => options.strict = true,
            "--hidden" => options.scan.discover.hidden = true,
            "--no-ignore" => options.scan.discover.respect_ignore = false,
            "--template" => {
                let value = rest
                    .next()
                    .ok_or_else(|| "--template needs a path".to_string())?;
                options.scan.template = Some(value.clone());
            }
            "--exclude" => {
                let value = rest
                    .next()
                    .ok_or_else(|| "--exclude needs a pattern".to_string())?;
                options.scan.discover.exclude.push(value.clone());
            }
            "--file" => {
                let value = rest
                    .next()
                    .ok_or_else(|| "--file needs a path".to_string())?;
                options.files.push(PathBuf::from(value));
            }
            path => roots.push(PathBuf::from(path)),
        }
    }

    if roots.len() > 1 {
        return Err("name one directory, not several. Try --file to pick files.".to_string());
    }
    if !options.files.is_empty() && !roots.is_empty() {
        return Err("--file and a directory are two different questions".to_string());
    }
    if let Some(root) = roots.pop() {
        options.root = root;
    }
    Ok(options)
}

/// The human half. Every line restates something already on stdout.
fn summarise(report: &Report) {
    let mut stderr = std::io::stderr().lock();

    for diagnostic in &report.diagnostics {
        let _ = writeln!(stderr, "{}: {}", diagnostic.file, diagnostic.message);
    }
    for mismatch in &report.missing_keys {
        let _ = writeln!(
            stderr,
            "{}: missing {} (in {})",
            mismatch.file,
            mismatch.keys.join(", "),
            mismatch.reference
        );
    }
    for mismatch in &report.extra_keys {
        let _ = writeln!(
            stderr,
            "{}: extra {} (not in {})",
            mismatch.file,
            mismatch.keys.join(", "),
            mismatch.reference
        );
    }

    let _ = match report.status {
        Status::NoFiles => writeln!(stderr, "no dotenv files found"),
        Status::InSync => writeln!(
            stderr,
            "in sync — {}",
            plural(report.summary.files, "file", "files")
        ),
        _ => writeln!(
            stderr,
            "out of sync — {} across {}",
            // **Files, not entries.** `missing + extra` counts findings:
            // one file missing two keys and holding one extra is three,
            // and the line then read "3 files with mismatches across 3
            // files" for a single bad file. Counted by distinct path.
            plural(
                files_with_mismatches(report),
                "file with mismatches",
                "files with mismatches"
            ),
            plural(report.summary.files, "file", "files")
        ),
    };
}

/// How many distinct files carry a mismatch of either kind.
fn files_with_mismatches(report: &Report) -> usize {
    let mut seen: Vec<&str> = Vec::new();
    for path in report
        .missing_keys
        .iter()
        .map(|entry| entry.file.as_str())
        .chain(report.extra_keys.iter().map(|entry| entry.file.as_str()))
    {
        if !seen.contains(&path) {
            seen.push(path);
        }
    }
    seen.len()
}

fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempTree;

    fn sample_report() -> Report {
        let tree = TempTree::new("cli-report");
        tree.write(".env.example", "A=1\nB=2\n");
        tree.write(".env.staging", "A=1\n");
        let options = parse(&[
            "--template".into(),
            ".env.example".into(),
            "--hidden".into(),
            tree.path().to_string_lossy().into_owned(),
        ])
        .expect("a valid command line");
        scan::scan(&options.root, &options.scan).expect("a scan")
    }

    #[test]
    fn a_pipe_gets_the_report_on_one_line() {
        let report = sample_report();
        let mut out = Vec::new();
        write_report(&mut out, &report, false).expect("a write");
        let text = String::from_utf8(out).expect("utf-8");
        assert_eq!(text.lines().count(), 1, "{text}");
        assert!(text.starts_with('{'), "{text}");
    }

    /// The summary on stderr already covers a person at a terminal.
    #[test]
    fn a_terminal_gets_no_json() {
        let report = sample_report();
        let mut out = Vec::new();
        write_report(&mut out, &report, true).expect("a write");
        assert!(out.is_empty());
    }

    #[test]
    fn every_documented_flag_is_parsed_and_the_reverse() {
        let mut documented: Vec<&str> = USAGE
            .split_whitespace()
            .filter(|word| word.starts_with("--"))
            .map(|word| word.trim_end_matches([',', '.', ':', ';']))
            .filter(|word| !matches!(*word, "--version" | "--help"))
            .collect();
        documented.sort_unstable();
        documented.dedup();

        let mut implemented = FLAGS.to_vec();
        implemented.sort_unstable();
        assert_eq!(documented, implemented);
    }

    #[test]
    fn the_parser_accepts_every_flag_it_lists() {
        for flag in FLAGS {
            let args: Vec<String> = match flag {
                "--template" | "--exclude" | "--file" => vec![flag.into(), "x".into()],
                _ => vec![flag.into()],
            };
            assert!(parse(&args).is_ok(), "{flag}");
        }
    }

    #[test]
    fn an_unknown_flag_is_refused_rather_than_ignored() {
        let error = parse(&["--tempate".into(), "x".into()]).expect_err("a refusal");
        assert!(error.contains("--tempate"), "{error}");
    }

    #[test]
    fn a_flag_with_no_value_is_refused() {
        for flag in ["--template", "--exclude", "--file"] {
            assert!(parse(&[flag.into()]).is_err(), "{flag}");
        }
    }

    #[test]
    fn the_working_directory_is_the_default_root() {
        assert_eq!(parse(&[]).expect("options").root, PathBuf::from("."));
    }

    #[test]
    fn one_directory_is_allowed_and_two_are_not() {
        assert_eq!(
            parse(&["src".into()]).expect("options").root,
            PathBuf::from("src")
        );
        assert!(parse(&["a".into(), "b".into()]).is_err());
    }

    #[test]
    fn a_directory_and_named_files_together_are_refused() {
        assert!(parse(&["--file".into(), "a".into(), "dir".into()]).is_err());
    }

    #[test]
    fn exclude_is_repeatable() {
        let options = parse(&[
            "--exclude".into(),
            "a".into(),
            "--exclude".into(),
            "b".into(),
        ])
        .expect("options");
        assert_eq!(options.scan.discover.exclude, ["a", "b"]);
    }

    /// The tool reads names, never values, and no flag may suggest
    /// otherwise.
    #[test]
    fn no_flag_offers_to_read_a_value() {
        for attempt in [
            "--values",
            "--show-values",
            "--compare-values",
            "--fix",
            "--write",
        ] {
            assert!(parse(&[attempt.into()]).is_err(), "{attempt} was accepted");
        }
        for word in ["value", "secret", "fix"] {
            assert!(!USAGE.contains(word), "the usage text offers {word}");
        }
    }

    #[test]
    fn the_usage_text_states_the_exit_codes_and_the_two_modes() {
        for code in ["0", "1", "2"] {
            assert!(USAGE.contains(code), "exit code {code} is undocumented");
        }
        assert!(USAGE.contains("union"), "auto mode is unexplained");
        assert!(USAGE.contains("template"), "template mode is unexplained");
    }
}

//! A standing net over the dotenv parser.
//!
//! Time-boxed, not run to convergence: the point is that a panic, a
//! hang, or a value on its way out has somewhere to be caught, not that
//! the input space is proved. Sixty seconds in CI, a second locally.
//!
//! **It fuzzes the pure layer.** `compare_env_files` is the tool that
//! takes file *contents* and touches no filesystem, so every case here
//! is `detect/parser.rs`, `detect/heuristics.rs` and `detect/compare.rs`
//! and nothing else — no walk, no temporary tree, no disk.
//!
//! Three properties, and the first is why this crate exists:
//!
//! 1. **No value ever leaves.** Every generated value carries a marker,
//!    and no marker may appear anywhere in the serialized answer.
//! 2. **An unterminated quote swallows the rest of the file.** dotenv's
//!    own behaviour, ported deliberately; the keys below one are simply
//!    not there, and this pins that rather than discovering it later.
//! 3. **Nothing panics and nothing hangs.** A slice off a character
//!    boundary kills the child, and the failure names the document that
//!    did it.
//!
//! The checked-in corpus is the seed set: every shared document is fed
//! through first, then mutations of it, then generated documents.

use std::fmt::Write as _;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, RecvTimeoutError, channel};
use std::time::{Duration, Instant};

const BINARY: &str = env!("CARGO_BIN_EXE_envsync-le");

/// Seconds of fuzzing. CI passes 60; a bare `cargo test` runs one, so
/// the net is present on every push without owning the run.
fn budget() -> Duration {
    let seconds = std::env::var("ENVSYNC_LE_FUZZ_SECONDS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(1);
    Duration::from_secs(seconds)
}

/// Printed on every run, failing or not: a fuzz failure nobody can
/// reproduce is a fuzz failure nobody fixes.
fn seed() -> u64 {
    std::env::var("ENVSYNC_LE_FUZZ_SEED")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(0x0e5c_7a11_0b1d_2026)
}

/// One case may not take longer than this. A parser that loops looking
/// for a quote that never closes would otherwise be a CI job that never
/// ends.
const CASE_LIMIT: Duration = Duration::from_secs(20);

/// The corpus, as seeds. Names are logical; the files on disk carry a
/// `dot` prefix because `cargo package` skips dotfiles.
const SEEDS: [(&str, &str); 8] = [
    (".env", include_str!("../fixtures/documents/dot.env")),
    (
        ".env.example",
        include_str!("../fixtures/documents/dot.env.example"),
    ),
    (
        ".env.production",
        include_str!("../fixtures/documents/dot.env.production"),
    ),
    (
        ".env.broken",
        include_str!("../fixtures/documents/dot.env.broken"),
    ),
    (
        ".env.multiline",
        include_str!("../fixtures/documents/dot.env.multiline"),
    ),
    (
        ".env.unterminated",
        include_str!("../fixtures/documents/dot.env.unterminated"),
    ),
    (
        ".env.casing",
        include_str!("../fixtures/documents/dot.env.casing"),
    ),
    (
        ".env.duplicate",
        include_str!("../fixtures/documents/dot.env.duplicate"),
    ),
];

/// xorshift64*, four lines and identical on every platform. A fuzz run
/// needs to be reproducible, not statistically excellent.
struct Seeded(u64);

impl Seeded {
    fn next(&mut self) -> u64 {
        let mut state = self.0;
        state ^= state >> 12;
        state ^= state << 25;
        state ^= state >> 27;
        self.0 = state;
        state.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    fn below(&mut self, limit: usize) -> usize {
        let limit = u64::try_from(limit).unwrap_or(1).max(1);
        usize::try_from(self.next() % limit).unwrap_or(0)
    }

    fn pick<'a, T>(&mut self, from: &'a [T]) -> &'a T {
        &from[self.below(from.len())]
    }
}

/// A server held open across the whole run: spawning a process per case
/// would measure `fork`, not the parser.
struct Server {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<Option<String>>,
}

impl Server {
    fn start() -> Self {
        let mut child = Command::new(BINARY)
            .arg("mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("the server starts");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = child.stdout.take().expect("stdout");

        // Read on a thread so a case that never answers is a timeout
        // naming its document rather than a blocked test.
        let (sender, lines) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if sender.send(line.ok()).is_err() {
                    return;
                }
            }
            let _ = sender.send(None);
        });

        Self {
            child,
            stdin,
            lines,
        }
    }

    /// Sends one `compare_env_files` call and returns the raw response
    /// line. Panics — naming the case — on a hang or a dead server.
    fn call(&mut self, case: &str, arguments: &serde_json::Value) -> String {
        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": { "name": "compare_env_files", "arguments": arguments },
        });
        writeln!(self.stdin, "{request}").unwrap_or_else(|error| {
            panic!("{case}: the server stopped reading ({error})");
        });
        self.stdin
            .flush()
            .unwrap_or_else(|error| panic!("{case}: could not flush ({error})"));

        match self.lines.recv_timeout(CASE_LIMIT) {
            Ok(Some(line)) => line,
            Ok(None) => panic!("{case}: the server died — a panic, or a slice off a boundary"),
            Err(RecvTimeoutError::Timeout) => {
                panic!("{case}: no answer in {CASE_LIMIT:?} — the parser is looping")
            }
            Err(RecvTimeoutError::Disconnected) => panic!("{case}: the server closed stdout"),
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// A generated document, and what the generator knows about it.
struct Document {
    name: String,
    body: String,
    /// every key the document defines, in order
    keys: Vec<String>,
    /// the marker inside every value it wrote
    markers: Vec<String>,
    /// keys defined after an unterminated quote opened — the ones the
    /// parser must never see
    swallowed: Vec<String>,
}

const NAMES: [&str; 8] = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".env.development",
    ".env.test",
    "app.device.env",
    "nested/service/.env",
];

/// Values are never reported, so every one is written with a marker that
/// cannot occur in a key: keys are `[A-Za-z_][A-Za-z0-9_.-]*` and a
/// marker contains a `~`.
fn marker(seeded: &mut Seeded) -> String {
    format!("~v{}~", seeded.next() % 1_000_000)
}

fn generate(seeded: &mut Seeded) -> Document {
    let name = (*seeded.pick(&NAMES)).to_string();
    let mut body = String::new();
    let mut keys = Vec::new();
    let mut markers = Vec::new();
    let mut swallowed = Vec::new();
    let mut open_quote: Option<char> = None;

    if seeded.below(8) == 0 {
        body.push('\u{feff}');
    }

    let entries = 1 + seeded.below(12);
    for index in 0..entries {
        let key = format!("KEY_{index}");
        let value = marker(seeded);
        let newline = if seeded.below(4) == 0 { "\r\n" } else { "\n" };

        // Once a quote is open the rest of the file is inside a value:
        // whatever is written below it is not a key, and that is exactly
        // the behaviour being pinned.
        let record_key = |keys: &mut Vec<String>, swallowed: &mut Vec<String>, open: bool| {
            if open {
                swallowed.push(key.clone());
                return;
            }
            keys.push(key.clone());
        };

        // A quote already open is closed by the next line that contains
        // the same character — that is the ported behaviour, not a bug —
        // so once one is open the generator writes only quote-free lines.
        // Otherwise the expectation below would be modelling the parser
        // rather than checking it.
        let arm = match seeded.below(11) {
            6 | 7 if open_quote.is_some() => 10,
            other => other,
        };
        match arm {
            0 => {
                let _ = write!(body, "# a comment {value}{newline}");
                markers.push(value);
            }
            1 => {
                body.push_str(newline);
            }
            2 => {
                // no equals sign: the whole line is echoed in the error,
                // so it deliberately carries no value marker
                let _ = write!(body, "JUST_A_WORD_{index}{newline}");
            }
            3 => {
                let _ = write!(body, "2BAD_{index}={value}{newline}");
                markers.push(value);
            }
            4 => {
                let _ = write!(body, "export {key}={value}{newline}");
                markers.push(value);
                record_key(&mut keys, &mut swallowed, open_quote.is_some());
            }
            5 => {
                // a duplicate of the previous key
                let _ = write!(body, "KEY_{}={value}{newline}", index.saturating_sub(1));
                markers.push(value);
            }
            6 => {
                let quote = *seeded.pick(&['"', '\'', '`']);
                let _ = write!(
                    body,
                    "{key}={quote}{value}{newline}more {value}{newline}{quote}{newline}"
                );
                markers.push(value);
                record_key(&mut keys, &mut swallowed, open_quote.is_some());
            }
            7 if open_quote.is_none() => {
                // the unterminated quote: everything after it belongs to
                // this value
                let quote = *seeded.pick(&['"', '\'', '`']);
                let _ = write!(body, "{key}={quote}{value}{newline}");
                markers.push(value);
                record_key(&mut keys, &mut swallowed, false);
                open_quote = Some(quote);
            }
            8 => {
                let _ = write!(body, "   {key}   =   {value}\u{1f389}{newline}");
                markers.push(value);
                record_key(&mut keys, &mut swallowed, open_quote.is_some());
            }
            9 => {
                let _ = write!(body, "{key}={value}\u{0}\u{7f}{newline}");
                markers.push(value);
                record_key(&mut keys, &mut swallowed, open_quote.is_some());
            }
            _ => {
                let _ = write!(body, "{key}={value}{newline}");
                markers.push(value);
                record_key(&mut keys, &mut swallowed, open_quote.is_some());
            }
        }
    }

    // Half the documents end without a newline.
    if seeded.below(2) == 0 {
        while body.ends_with('\n') || body.ends_with('\r') {
            body.pop();
        }
    }

    Document {
        name,
        body,
        keys,
        markers,
        swallowed,
    }
}

/// A template naming every key the document could define, so a key the
/// parser did not see comes back by name in `missingKeys` rather than as
/// a count nobody can check.
fn template_for(document: &Document) -> String {
    let mut body = String::new();
    for key in document.keys.iter().chain(document.swallowed.iter()) {
        body.push_str(key);
        body.push_str("=\n");
    }
    body
}

fn arguments(document: &Document) -> serde_json::Value {
    serde_json::json!({
        "files": [
            { "path": ".env.example", "content": template_for(document) },
            { "path": document.name, "content": document.body },
        ],
        "mode": "template",
        "templatePath": ".env.example",
    })
}

/// Everything asserted about one answer.
fn check(case: &str, document: &Document, raw: &str) {
    let response: serde_json::Value = serde_json::from_str(raw)
        .unwrap_or_else(|error| panic!("{case}: the answer is not JSON ({error}) — {raw}"));
    assert!(
        response.get("error").is_none(),
        "{case}: the tool call failed — {raw}"
    );
    let envelope = &response["result"]["structuredContent"];
    assert!(
        envelope["meta"]["tool"] == "compare_env_files",
        "{case}: not the tool's envelope — {raw}"
    );

    // 1. No value leaves. Checked against the whole serialized answer,
    //    not a field somebody remembered to look at.
    for value in &document.markers {
        assert!(
            !raw.contains(value.as_str()),
            "{case}: a value reached the answer ({value})\ndocument:\n{}\nanswer:\n{raw}",
            document.body
        );
    }

    // 2. An unterminated quote swallows the rest of the file, so every
    //    key below it is missing against a template that has them all.
    let mismatches = envelope["data"]["missingKeys"]
        .as_array()
        .unwrap_or_else(|| panic!("{case}: no missingKeys — {raw}"));
    let missing: Vec<&str> = mismatches
        .iter()
        .filter(|mismatch| mismatch["filepath"] == document.name.as_str())
        .flat_map(|mismatch| mismatch["keys"].as_array().expect("keys").iter())
        .filter_map(serde_json::Value::as_str)
        .collect();
    for key in &document.swallowed {
        assert!(
            missing.contains(&key.as_str()),
            "{case}: {key} was written after an unterminated quote and still parsed\n\
             document:\n{}\nanswer:\n{raw}",
            document.body
        );
    }

    // 3. Nothing but a key name ever comes back as a finding.
    for key in &missing {
        assert!(
            key.chars()
                .next()
                .is_some_and(|first| first.is_ascii_alphabetic() || first == '_'),
            "{case}: {key:?} is not a key name — {raw}"
        );
    }
}

#[test]
fn the_parser_survives_the_corpus_and_what_grows_out_of_it() {
    let seed = seed();
    let budget = budget();
    eprintln!("fuzz: seed {seed:#x}, budget {budget:?}");

    let mut server = Server::start();
    let mut seeded = Seeded(seed);
    let mut cases = 0usize;

    // The checked-in corpus first: the documents the two frontends
    // already agree about are the seeds everything else grows from.
    for (name, body) in SEEDS {
        let document = Document {
            name: name.to_string(),
            body: body.to_string(),
            keys: Vec::new(),
            markers: Vec::new(),
            swallowed: Vec::new(),
        };
        let case = format!("seed corpus {name}");
        let raw = server.call(&case, &arguments(&document));
        check(&case, &document, &raw);
        cases += 1;
    }

    let deadline = Instant::now() + budget;
    while Instant::now() < deadline {
        let document = generate(&mut seeded);
        let case = format!("seed {seed:#x} case {cases}");
        let raw = server.call(&case, &arguments(&document));
        check(&case, &document, &raw);
        cases += 1;
    }

    eprintln!("fuzz: {cases} documents, seed {seed:#x}");
    assert!(cases > SEEDS.len(), "the fuzzer ran no generated documents");
}

/// The behaviour by name, pinned outside the random path so a failure
/// says what broke rather than which seed found it.
#[test]
fn an_unterminated_quote_swallows_the_rest_of_the_file() {
    let mut server = Server::start();
    let raw = server.call(
        "unterminated",
        &serde_json::json!({
            "files": [
                { "path": ".env.example", "content": "BEFORE=\nBROKEN=\nAFTER=\nLOST=\n" },
                { "path": ".env", "content": "BEFORE=1\nBROKEN=\"never closed\nAFTER=2\nLOST=3\n" },
            ],
            "mode": "template",
            "templatePath": ".env.example",
        }),
    );
    let response: serde_json::Value = serde_json::from_str(&raw).expect("JSON");
    let envelope = &response["result"]["structuredContent"];
    let missing = &envelope["data"]["missingKeys"][0];
    assert_eq!(missing["filepath"], ".env");
    assert_eq!(missing["keys"].as_array().expect("keys").len(), 2, "{raw}");
    assert_eq!(missing["keys"][0], "AFTER");
    assert_eq!(missing["keys"][1], "LOST");
    assert!(
        raw.contains("Unterminated"),
        "the swallowing is reported, never silent — {raw}"
    );
    assert!(
        !raw.contains("never closed"),
        "the value reached the answer — {raw}"
    );
}

//! The dotenv parser: key names, and the lines that are not keys.
//!
//! **Only names are read.** A dotenv file is where credentials live and
//! the answer does not need the values, so no value is ever kept, logged
//! or returned. The parity script greps the corpus for one.
//!
//! Ported from `parser.ts`, including the parts that look like bugs and
//! are documented behaviour.

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

/// A key must look like an environment variable. Anything else to the
/// left of `=` is a parse error naming its line rather than a key.
static KEY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z_][a-zA-Z0-9_.-]*$").expect("a constant pattern compiles")
});

/// The characters JavaScript's `String.prototype.trim` removes, which is
/// **not** the same set as Rust's `char::is_whitespace`.
///
/// Two characters differ, and both showed up as the two frontends
/// disagreeing about a real file:
///
/// - **U+FEFF**, a byte-order mark anywhere but the first byte. JS trims
///   it, Rust does not. A `.env` written by Notepad and then edited
///   parsed here as a key named `\u{feff}KEY` — an invalid-key error —
///   while the extension read it as `KEY`, opened its quoted value, and
///   swallowed the rest of the file. The same document, two different
///   answers about how much of it was read.
/// - **U+0085**, NEL. Rust trims it, JS does not. The mirror image, and
///   just as wrong.
///
/// `compare_env_files` is offered by both servers and must answer
/// identically, so the parser matches JavaScript exactly rather than
/// approximately.
fn is_js_whitespace(character: char) -> bool {
    (character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}

fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

/// `^export\s+` with JavaScript's `\s`, which is why this is not a
/// regex: the crate's `\s` is `\p{White_Space}` and JavaScript's is not.
fn without_export(key: &str) -> &str {
    let Some(rest) = key.strip_prefix("export") else {
        return key;
    };
    let stripped = rest.trim_start_matches(is_js_whitespace);
    // `\s+` needs at least one separator: a key that is exactly
    // `exportFOO` keeps its name.
    if stripped.len() == rest.len() {
        return key;
    }
    stripped
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ParseError {
    #[serde(rename = "type")]
    pub(crate) kind: String,
    pub(crate) message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct Parsed {
    pub(crate) keys: Vec<String>,
    pub(crate) errors: Vec<ParseError>,
}

pub(crate) fn parse(content: &str) -> Parsed {
    let lines: Vec<&str> = content
        .split('\n')
        .map(|line| line.trim_end_matches('\r'))
        .collect();
    let mut keys: Vec<String> = Vec::new();
    let mut errors = Vec::new();
    let mut index = 0;

    while index < lines.len() {
        let line = js_trim(lines[index]);
        let line_number = index + 1;
        index += 1;

        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // **Neither message quotes the line.** A diagnostic that echoes
        // what it could not parse is the one way a value leaves this
        // crate, and both of these reach real value material: the
        // continuation lines of a multi-line certificate have no `=` at
        // all, and a connection string wrapped onto its own line has one
        // inside its query parameters — which makes the whole credential
        // the "key" that failed to parse. The line number is the pointer;
        // the content stays in the file.
        let Some(equals) = line.find('=') else {
            errors.push(error(line_number, "Missing equals sign"));
            continue;
        };

        let key = without_export(js_trim(&line[..equals])).to_string();
        if key.is_empty() {
            errors.push(error(line_number, "Empty key before equals sign"));
            continue;
        }
        if !KEY.is_match(&key) {
            errors.push(error(line_number, "Invalid key format"));
            continue;
        }

        // A quoted value with no closing quote on this line spans the
        // following ones. Consuming them is what stops a certificate's
        // body being read as a page of malformed entries.
        if let Some(quote) = open_quote(js_trim(&line[equals + 1..])) {
            while index < lines.len() && !closes_quote(lines[index], quote) {
                index += 1;
            }
            if index >= lines.len() {
                // dotenv's own behaviour: the rest of the file is inside
                // the value, so the keys below it are simply not there.
                // One stray quote can make a file look nearly empty, and
                // saying so is the whole point of reporting it.
                errors.push(error(
                    line_number,
                    &format!("Unterminated {quote} quoted value for \"{key}\""),
                ));
            } else {
                index += 1;
            }
        }

        // A duplicate counts once — dotenv itself keeps one occurrence.
        if !keys.iter().any(|existing| existing == &key) {
            keys.push(key);
        }
    }

    Parsed { keys, errors }
}

fn error(line: usize, message: &str) -> ParseError {
    ParseError {
        kind: "parse-error".to_string(),
        message: format!("Line {line}: {message}"),
    }
}

fn open_quote(value: &str) -> Option<char> {
    let first = value.chars().next()?;
    if !matches!(first, '"' | '\'' | '`') {
        return None;
    }
    let rest = &value[first.len_utf8()..];
    (!closes_quote(rest, first)).then_some(first)
}

fn closes_quote(line: &str, quote: char) -> bool {
    let mut chars = line.chars();
    while let Some(character) = chars.next() {
        if character == '\\' {
            chars.next();
            continue;
        }
        if character == quote {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(content: &str) -> Vec<String> {
        parse(content).keys
    }

    #[test]
    fn a_plain_assignment_yields_its_key() {
        assert_eq!(keys("DATABASE_URL=postgres://x"), ["DATABASE_URL"]);
    }

    /// The property this whole crate rests on.
    #[test]
    fn a_value_is_never_kept() {
        let parsed = parse("SECRET=hunter2\nOTHER=postgres://user:pw@host/db");
        let rendered = format!("{parsed:?}");
        assert!(!rendered.contains("hunter2"), "{rendered}");
        assert!(!rendered.contains("postgres"), "{rendered}");
    }

    #[test]
    fn comments_and_blank_lines_are_skipped() {
        assert_eq!(keys("# a note\n\nA=1\n   \nB=2"), ["A", "B"]);
    }

    #[test]
    fn an_export_prefix_is_stripped() {
        assert_eq!(keys("export FEATURE_FLAGS=a,b"), ["FEATURE_FLAGS"]);
    }

    #[test]
    fn a_duplicate_counts_once() {
        assert_eq!(keys("DUP=1\nDUP=2\nOTHER=3"), ["DUP", "OTHER"]);
    }

    #[test]
    fn a_line_without_an_equals_is_an_error() {
        let parsed = parse("JUST_A_WORD");
        assert!(parsed.keys.is_empty());
        assert_eq!(parsed.errors.len(), 1);
        assert!(parsed.errors[0].message.contains("Missing equals sign"));
    }

    #[test]
    fn a_key_that_is_not_a_key_is_an_error() {
        let parsed = parse("2BAD=1\n=novalue\nGOOD=2");
        assert_eq!(parsed.keys, ["GOOD"]);
        assert_eq!(parsed.errors.len(), 2);
        assert!(parsed.errors[0].message.contains("Invalid key format"));
        assert!(parsed.errors[1].message.contains("Empty key"));
    }

    /// Dotted names are what Spring and other Java stacks put in a `.env`,
    /// and the `dotenv` reference loader reads them.
    #[test]
    fn a_dotted_key_is_a_key() {
        let parsed = parse("spring.datasource.url=x\nlogging.level.root=INFO\n");
        assert_eq!(parsed.keys, ["spring.datasource.url", "logging.level.root"]);
        assert!(parsed.errors.is_empty());
        assert!(
            !parse(".hidden=1").errors.is_empty(),
            "a key still starts with a letter or _"
        );
    }

    #[test]
    fn an_error_names_its_line() {
        let parsed = parse("A=1\nB=2\nBROKEN");
        assert!(
            parsed.errors[0].message.starts_with("Line 3:"),
            "{parsed:?}"
        );
    }

    /// A certificate in a `.env` is the ordinary case for this.
    #[test]
    fn a_quoted_value_may_span_lines() {
        let parsed = parse("FIRST=1\nCERT=\"-----BEGIN-----\nbody\n-----END-----\"\nAFTER=2");
        assert_eq!(parsed.keys, ["FIRST", "CERT", "AFTER"]);
        assert!(parsed.errors.is_empty());
    }

    #[test]
    fn every_quote_style_opens_a_multiline_value() {
        for quote in ['"', '\'', '`'] {
            let parsed = parse(&format!("A={quote}one\ntwo{quote}\nB=2"));
            assert_eq!(parsed.keys, ["A", "B"], "{quote}");
        }
    }

    /// dotenv's own behaviour, ported: the rest of the file is inside
    /// the value, so the keys below it are simply not there.
    #[test]
    fn an_unterminated_quote_swallows_the_rest_of_the_file() {
        let parsed = parse("BEFORE=1\nBROKEN=\"never closed\nAFTER=2\nLOST=3");
        assert_eq!(parsed.keys, ["BEFORE", "BROKEN"]);
        assert_eq!(parsed.errors.len(), 1);
        assert!(parsed.errors[0].message.contains("Unterminated"));
    }

    /// A quote that opens and closes on its own line is not multi-line.
    #[test]
    fn a_closed_quote_on_one_line_consumes_nothing() {
        assert_eq!(keys("A=\"one\"\nB=2"), ["A", "B"]);
    }

    #[test]
    fn an_escaped_quote_does_not_close_the_value() {
        let parsed = parse("A=\"one \\\" still open\ntwo\"\nB=2");
        assert_eq!(parsed.keys, ["A", "B"]);
    }

    #[test]
    fn carriage_returns_do_not_end_up_in_keys() {
        assert_eq!(keys("A=1\r\nB=2\r\n"), ["A", "B"]);
    }

    #[test]
    fn an_empty_document_yields_nothing() {
        assert_eq!(parse(""), Parsed::default());
    }

    /// **Regression.** A BOM anywhere but the first byte is whitespace
    /// to JavaScript and not to Rust, so the same document read as an
    /// invalid key here and as an open quoted value there — one
    /// frontend seeing the rest of the file and the other not.
    #[test]
    fn a_byte_order_mark_is_whitespace_the_way_javascript_says_it_is() {
        assert_eq!(keys("\u{feff}KEY=1"), ["KEY"]);
        assert_eq!(keys("A=1\n\u{feff}B=2"), ["A", "B"]);
        assert_eq!(keys("export\u{feff}KEY=1"), ["KEY"]);

        let swallowed = parse("\u{feff}KEY=\"never closed\nLOST=1");
        assert_eq!(swallowed.keys, ["KEY"]);
        assert!(swallowed.errors[0].message.contains("Unterminated"));

        // A mark inside a name still is not one.
        let inside = parse("K\u{feff}EY=1");
        assert!(inside.keys.is_empty());
        assert!(inside.errors[0].message.contains("Invalid key format"));
    }

    /// The mirror image: `char::is_whitespace` trims NEL and JavaScript
    /// does not, so trimming it here would invent the same disagreement
    /// in the other direction.
    #[test]
    fn a_next_line_character_is_not_whitespace() {
        let parsed = parse("\u{85}KEY=1");
        assert!(parsed.keys.is_empty(), "{parsed:?}");
        assert!(parsed.errors[0].message.contains("Invalid key format"));
        assert_eq!(keys("export\u{85}KEY=1"), Vec::<String>::new());
    }

    #[test]
    fn a_quoted_value_opens_through_a_byte_order_mark() {
        let parsed = parse("KEY=\u{feff}\"open\nNEXT=2");
        assert_eq!(parsed.keys, ["KEY"]);
        assert_eq!(parsed.errors.len(), 1);
    }
}

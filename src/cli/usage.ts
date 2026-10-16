/**
 * The command line's help text and the flags it names.
 *
 * Word for word the Rust CLI's, because both install as `envsync-le` and a
 * person reading `--help` cannot tell which one they have.
 * `scripts/check-cli-parity.ts` compares the two outputs, and `cli.test.ts`
 * holds FLAGS equal to the flags this text names.
 */

export const USAGE = `usage: envsync-le [options] [dir]
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
\`.env.bak\` that is not text says nothing about whether the real ones
agree. --strict turns it back into a failure.

Exit codes: 0 in sync · 1 out of sync · 2 malformed question. Finding no
dotenv files at all is 0 — there is nothing to be out of sync with.`;

/** Every flag the parser accepts, in the crate's order. */
export const FLAGS: readonly string[] = Object.freeze([
	'--template',
	'--strict',
	'--file',
	'--ignore-case',
	'--exclude',
	'--hidden',
	'--no-ignore',
]);

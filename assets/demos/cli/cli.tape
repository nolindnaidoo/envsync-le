# envsync-le, the command line, driving the release build against input/.
#   cargo build --release in crate/, then from letools-site:
#   bun run record:demo ../envsync-le cli
# The inputs are committed as env.* and renamed to .env.* in a temp copy, so
# no .env file is ever committed. Every value is a placeholder.

Set Shell "bash"
Set FontSize 28
Set Width 1600
Set Height 1000
Set Padding 32
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"

Hide
Type `D=$PWD; cd "$(mktemp -d /tmp/envsync-le.XXXX)" && cp -R "$D/input/." . && for f in env.*; do mv "$f" ".$f"; done && export PATH="$D/../../../crate/target/release:$PATH" && PS1="$ " && clear`
Enter
Type "cat .env.staging"
Enter
Sleep 2.5s
Show

Type "envsync-le --template .env.example --hidden --no-ignore . > report.json"
Enter
Sleep 5s

Type 'echo "exit $?"'
Enter
Sleep 3s

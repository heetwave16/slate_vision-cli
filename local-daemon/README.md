# slate-live-daemon

Runs the **real shell** (`$SHELL`, zsh on macOS) in a PTY and streams its
side-effects as ShellScope `VizEvent`s over a localhost WebSocket — the same
event shapes the in-browser sandbox engine emits, so the web UI's
StagePanels / FsCanvas / light-log animate for genuinely real commands.

```
cd local-daemon
npm install        # compiles node-pty (macOS: works out of the box)
npm run live       # → [shellscope] live daemon on ws://127.0.0.1:8787?token=…
```

Then in the web app: **⚙ → Go Live (real shell)** — paste the token if
shown, and the xterm.js pane attaches to your real shell.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `SLATE_PORT` | `8787` | WS port (127.0.0.1 only) |
| `SLATE_SHELL` | `$SHELL` / `/bin/zsh` | shell binary to spawn |
| `SLATE_CWD` | `$HOME` | starting dir + fsevents watch root |

## Protocol (JSON over WS)

browser → daemon: `{kind:'input', data}` · `{kind:'resize', cols, rows}` · `{kind:'ping'}`
daemon → browser: `{kind:'data', data}` (raw PTY) · `{kind:'event', event:VizEvent}` ·
`{kind:'cmd', t:'start'|'end', line, cwd?, took?}`

## How observation works

- **fsevents** (via chokidar) on `$SLATE_CWD`, depth 8, ignoring
  `node_modules`/`.git/objects` → `flash` events with the same
  A/M/D colors the sandbox uses.
- **git**: `rev-parse HEAD` / `branch --show-current` / `log -n 6` /
  `status --porcelain` / `for-each-ref` before & after each command window
  → `stage: git` payload with the real commit graph.
- **ps** snapshots before/after → `proc` events for spawned children.
- Command windows are prompt-delimited. For perfect timing, inject the
  zsh `preexec`/`precmd` hook described in
  [`../docs/REAL_MAC_TERMINAL.md`](../docs/REAL_MAC_TERMINAL.md) §3.

## Security

- Binds to 127.0.0.1 only; WS handshake requires the random token.
- The daemon is a pure observer + PTY pipe — it never executes anything
  the user didn't type in the terminal.

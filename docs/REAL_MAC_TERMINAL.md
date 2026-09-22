# Turning ShellScope into a REAL Mac Terminal App (with animated previews)

The current app runs a **virtual** sandbox: every command is emulated in the browser.
This document describes the architecture that keeps the exact same UI and animation
engine but swaps the *virtual* engine for the **real shell on the user's Mac** — so
`ls`, `git`, `npm`, `brew`, `node`… are the genuine macOS binaries, and the app's
job becomes what it's best at: **showing an animated preview of what each command
actually did to your machine.**

---

## 1. The core idea

A real terminal = `zsh` (or bash) in a PTY, with the real `$PATH`.
The app never re-implements commands. Instead it **observes** the system while the
user's real shell runs, and translates side-effects into the existing
`VizEvent` stream (`flash` / `packet` / `stage` / `proc` / `log`) that
`StagePanels.tsx`, `FsCanvas.tsx` and the terminal feed already understand.

```
┌────────────────────────────── Mac ────────────────────────────────┐
│  Local daemon (Node, `npm run live`)                              │
│                                                                   │
│  ┌─────────────┐   spawn    ┌──────────────────────────────────┐  │
│  │ node-pty    │───────────▶│ /bin/zsh  (REAL shell, REAL PATH)│  │
│  │  (PTY)      │◀───────────│ user types real commands here    │  │
│  └─────────────┘            └──────────────────────────────────┘  │
│        │  raw I/O                                                  │
│        ▼                                                           │
│  ┌─────────────┐  classify   ┌────────────────────────────────┐   │
│  │ classifier  │────────────▶│ observation layer              │   │
│  └─────────────┘             │  • fsevents  → file A/M/D      │   │
│                              │  • .git parse → commits/graph  │   │
│                              │  • lsof/netstat → sockets      │   │
│                              │  • ps → process tree           │   │
│                              └───────────────┬────────────────┘   │
│                                              ▼ VizEvent JSON      │
│  ┌─────────────┐                             │                    │
│  │ WebSocket   │◀────────────────────────────┘                    │
│  │ :8787       │                                                   │
└───────────────────────────────────────────────────────────────────┘
                 │ ws
┌────────────────▼────────────────────── Browser ────────────────────┐
│  xterm.js (real terminal rendering)  +  StagePanels/FsCanvas       │
│  (same components the sandbox already uses — zero rework)          │
└────────────────────────────────────────────────────────────────────┘
```

Why the UI survives unchanged: the sandbox engine already emits a typed
`VizEvent[]` per command. The daemon emits the **same JSON shape** from real
observations. The React side never knows whether the event came from
`executeCommand()` or from `fsevents`.

---

## 2. What each observation channel gives you (Mac APIs)

| Channel | macOS API | Feeds which preview |
|---|---|---|
| Filesystem | `fsevents` (native C API; via `fsevents`/`chokidar` npm) | FsCanvas node add/modify/delete + flash colors (#3fdc9b / #f5b454 / #f2708a) — **exactly** the sandbox's checkout flash logic |
| Git | read the real `.git/`: `HEAD`, `refs/heads/*`, `git log --oneline -n 6 --format=%H %s`, `git status --porcelain`, `git diff --numstat` | GIT OPERATION overlay: real commit graph, real branch chips, real diff hunks (parse `git diff -U3` with the existing `diff.ts`) |
| Network | `lsof -i -P -n` before/after each command (or `netstat`); DNS via `dscacheutil` | NETWORK FLOW overlay: host/IP from real lookup, real latency between snapshots |
| Processes | `ps -axo pid,ppid,command` / `sysctl` | PIPELINE FLOW overlay: real child processes spawned by the command, with real exit codes |
| Packages | `npm ls --json`, `node_modules` mtime, `brew list --versions` | PACKAGE RESOLUTION overlay |
| Clipboard/screen | `pbpaste`, `screencapture` (user-run) | fun extras |

The **command classifier** is 95% already written: this repo's
`classifyStage(cmdLine)` logic (in `interpreter.ts` handlers) maps
`curl → network`, `|` → pipeline, `git X → git`, `npm → npm`. The daemon
reuses the same table (see `local-daemon/src/classify.ts`).

---

## 3. The zsh hook (the glue that makes timing perfect)

The daemon wraps the user's shell with a tiny preload that reports every
command's start/finish over a Unix socket — the exact moment to take
before/after snapshots:

```zsh
# ~/.zshrc (injected by the daemon via ZDOTDIR, never edits the user's file)
preexec() {
  echo "{\"t\":\"start\",\"cmd\":\"${HISTCMD:-}\",\"line\":\"${1}\",\"cwd\":\"$PWD\"}" \
    | nc -U /tmp/shellscope.sock 2>/dev/null &
}
precmd() {
  echo "{\"t\":\"end\",\"rc\":$?}" | nc -U /tmp/shellscope.sock 2>/dev/null &
}
```

With this, "preview for command N" is exactly the diff of observations
between `start(N)` and `end(N)` — same semantics as one
`executeCommand()` call in the sandbox.

---

## 4. Shipping it — three packaging options (same daemon)

| Option | Shell | Terminal renderer | Effort | Notes |
|---|---|---|---|---|
| **A. Web app + local daemon** (recommended start) | real zsh via daemon | **xterm.js** in this exact React app (`<LivePanel/>` in this repo) | 1 day | Keep the current URL as "Sandbox" mode, add a **Go Live** button that connects to `ws://127.0.0.1:8787`. Works today, no installer. |
| **B. Tauri 2 app** | daemon bundled as sidecar | xterm.js (Tauri WebView) | +1–2 days | `tauri.conf.json` → bundle `local-daemon` as a sidecar, auto-start on launch. Distributable as a .dmg. |
| **C. Native SwiftUI** | `NSTask` + `PTY` (`openpty()`) | `libghostty`/`swift-term` | +2 weeks | Full native feel (menu bar, keyboard shortcuts), but you rewrite the renderer and **lose the StagePanels React code** unless you embed a WKWebView for the side panel. |

Recommended path: **A now → B for distribution**. Option A is already
scaffolded in this repo (`local-daemon/` + `src/live/`).

---

## 5. Step-by-step (Option A)

1. `cd local-daemon && npm install` (installs `node-pty`, `ws`, `chokidar`).
2. `npm run live` → daemon starts on `:8787`, spawns `/bin/zsh` (or
   `$SHELL`) in the user's real home dir, starts watchers for
   `$PWD`, `.git`, and `node_modules`.
3. In the browser app press **⚡ Go Live** (top bar). It connects,
   mounts xterm.js, and routes daemon events through the *existing*
   `App.scheduleEvents()` pipeline — StagePanels light up for real commands.
4. User runs `git commit -m "x"` in the xterm pane → daemon sees the
   `.git` change + `git status` diff → sends `stage: git` payload with the
   **real** commit hash/message → the same commit-graph overlay animates.

### Security model (important for a real shell)
- Daemon binds to **127.0.0.1 only**, random token in the WS handshake.
- The classifier is read-only observation; the daemon never executes
  anything the user didn't type.
- Optionally the daemon can start zsh inside a **restricted sandbox dir**
  (e.g. a "scratch" folder) with `fsevents` scoped to it — same as the
  virtual sandbox, but with real binaries.

---

## 6. What the app's identity becomes

- **Sandbox mode** (current): safe, shareable, works in any browser — the
  teaching/demo surface. 100+ commands, deterministic, zero risk.
- **Live mode** (this doc): the real Mac terminal, with the best
  "what just happened?" visualization in the world of terminal apps.

Both modes share: the terminal renderer, StagePanels overlays, FsCanvas,
event scheduler, and the classifier table. That's the moat — the preview
engine is shell-agnostic by design, which is exactly why it was built on
`VizEvent`s instead of hard-coded animations.

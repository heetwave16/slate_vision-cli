# 🔮 Slate Vision CLI (`slate_vision-cli`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen.svg)](https://heetwave16.github.io/slate_vision-cli/)
[![Tests](https://img.shields.io/badge/Tests-39%2F39%20Passed-emerald.svg)](scripts/verify-terminal-suite.ts)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.3-646cff.svg?logo=vite)](https://vitejs.dev/)

> **An interactive terminal visualization playground featuring real-time POSIX simulation, Obsidian-inspired force-directed physics graph, Homebrew package manager, and dynamic Oh My Zsh prompt themes.**

🌐 **Live Worldwide Demo:** [https://heetwave16.github.io/slate_vision-cli/](https://heetwave16.github.io/slate_vision-cli/)

---

## ✨ Highlights & Features

### 🖥️ Full-Featured Virtual Terminal Engine
- **50+ POSIX & Unix Builtins:** `pwd`, `ls -la`, `cd`, `tree`, `cat`, `touch`, `mkdir -p`, `cp`, `mv`, `rm -rf`, `chmod`, `stat`, `find`, `du`, `diff`, `grep`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, `tr`, `tee`, `which`, `uname`, `whoami`, `id`, `date`, `uptime`, `df`, `ps`, and more.
- **Shell Combinators:** Full support for multi-stage pipes (`|`), append/overwrite redirection (`>`, `>>`), conditional chaining (`&&`, `||`), and sequencing (`;`).
- **Real-Time Execution Animations:** TTY packets fly across visual filesystem nodes as commands execute.

### 🕸️ Obsidian-Style Interactive Physics Graph
- **Force-Directed Physics Simulation (60 FPS):** Governed by Coulomb electrostatic repulsion, Hooke's Law spring tension, center gravity, and ambient hover micro-drift.
- **Hold & Drag Elasticity:** Click, hold, and drag any file or directory node—it smoothly follows your pointer, elastically flexing and pulling connected neighbor files.
- **Subgraph Hover Illumination:** Hovering over any node illuminates its connected network with radiant glowing halos while gracefully dimming unrelated nodes.
- **HUD Metadata Tooltip:** Real-time floating HUD displaying file name, human-readable size, MIME type, and inspection hints.

### 🌲 Tree DAG Filesystem Visualizer
- **Natural Two-Finger Panning:** Two-finger trackpad drag smoothly pans the tree canvas in all directions without accidental zooming.
- **Pinch-to-Zoom & Cursor Pivot:** Pinch on trackpads or `Cmd/Ctrl + Scroll` to zoom in/out centered directly under your cursor.
- **Reset from Root Directory:** Dedicated `⌂ Root` button and `Home` / `⌘0` keyboard shortcuts instantly center the canvas starting from the root directory (`~`).

### 🍺 External Package Manager: Homebrew (`brew`)
- **Simulated Package Installation:** Run `brew install <pkg>` to watch the animated "🍺 Pouring bottle..." stage.
- **Real Runnable Binaries:**
  - `cowsay`: Customizable ASCII speech bubbles (e.g. `cowsay "Hello Open Source!"`).
  - `neofetch`: Colorized ASCII OS banner with live specs, uptime, and memory.
  - `figlet`: Big ASCII font banners for any input text.
  - `jq`: Real JSON processor supporting queries on files or stdin (`cat package.json | jq .`).
  - `bat`: Syntax-highlighted file viewer with line numbering.
  - `ripgrep` (`rg`): High-speed recursive pattern searcher.
  - `htop`: Interactive simulated CPU, memory, load average, and task list monitor.
- Package discovery & management: `brew list`, `brew info <pkg>`, and `brew uninstall <pkg>`.

### 🎨 Oh My Zsh (`omz`) & Dynamic Prompt Themes
- Run `omz install` to generate `~/.oh-my-zsh/` and `.zshrc`.
- Switch prompts dynamically on the fly:
  - `omz theme robbyrussell`: Classic `➜ ~/project git:(main)* ` with colored arrow and git branch indicators.
  - `omz theme agnoster`: Powerline segmented prompt (`[dev@sandbox]  [~/project]  [git:main*] `).
  - `omz theme powerlevel10k`: Modern two-level segmented developer prompt.
  - `omz theme minimal`: Ultra-clean minimalist prompt (`~/project ❯`).
- List themes and plugins: `omz list`.

### 💾 Persistent In-Browser Storage
- **Automatic Persistence:** Files, folders, installed brew packages, `.zshrc`, command history, and environment variables persist across page reloads via `localStorage`.
- **Snapshot Backup & Restore:**
  - `storage status`: Check storage backend, bytes used, and last sync timestamp.
  - `storage export`: Generates and automatically downloads a JSON backup of your entire sandbox.
  - `storage import <json>`: Restore or import any external sandbox snapshot.
  - `storage clear`: Reset storage cache.

### 🔍 Multi-Mode Inspector Modal
- Single-click any file to open the centered, animated viewport preview modal.
- Syntax-highlighted code viewer with line counts, copy-to-clipboard, and live editing.
- Dedicated **Package Formula Inspector** for Homebrew packages displaying version, description, homepage, bottle size, and binary paths.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Bun](https://bun.sh/) (recommended) or [Node.js](https://nodejs.org/) (v18+)

### 1. Clone the Repository
```bash
git clone https://github.com/heetwave16/slate_vision-cli.git
cd slate_vision-cli
```

### 2. Install Dependencies
```bash
bun install
# or: npm install
```

### 3. Start Development Server
```bash
bun run dev
# or: npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

### 4. Run Automated Verification Tests
```bash
bun test
# or: bun run scripts/verify-terminal-suite.ts
```

### 5. Build for Production
```bash
bun run build
# or: npm run build
```
Builds a single-file, self-contained production bundle in `dist/index.html`.

---

## 🧪 Test Suite & Quality Assurance

The terminal interpreter and simulation engine are verified by a comprehensive automated test suite covering all 50+ builtins, pipes, redirections, Git lifecycle, Homebrew packages, OMZ themes, and storage persistence:

```
================================================================
TOTAL TESTS:  39
PASSED:       39
FAILED:       0
PASS RATE:    100%
================================================================
```

---

## 🛠️ Tech Stack

- **Framework:** [React 19](https://react.dev/)
- **Build Tool:** [Vite 7](https://vitejs.dev/) with SingleFile bundler
- **Language:** [TypeScript 5.9](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Motion & UI:** [Framer Motion](https://www.framer.com/motion/)
- **Graphics & Physics:** HTML5 Canvas (Retina / DPR-aware 60 FPS explicit Euler integrator)
- **Icons & Typography:** JetBrains Mono, Inter

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check out the [Issues](https://github.com/heetwave16/slate_vision-cli/issues) page or read our [Contributing Guide](CONTRIBUTING.md).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

Crafted with ❤️ by [Heet Mehta](https://github.com/heetwave16).
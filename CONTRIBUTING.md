# Contributing to Slate Vision CLI

Thank you for your interest in contributing to **Slate Vision CLI**! Whether you are fixing a bug, adding new terminal builtins, creating new Homebrew formulas, or improving the physics engine, your help is warmly welcomed.

---

## 🛠️ Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/slate_vision-cli.git
   cd slate_vision-cli
   ```

2. **Install dependencies:**
   ```bash
   bun install
   # or: npm install
   ```

3. **Start the development server:**
   ```bash
   bun run dev
   ```
   Open [http://localhost:5173/](http://localhost:5173/) in your browser with hot module replacement (HMR).

4. **Run the automated test suite:**
   ```bash
   bun test
   ```

---

## 🏗️ Codebase Structure

- `src/App.tsx`: Main application container, keyboard listeners, layout, and state orchestration.
- `src/components/Terminal.tsx`: Terminal emulation UI, prompt themes, command history, and input handling.
- `src/components/FsCanvas.tsx`: Tree DAG visualizer, zoom, two-finger pan, and breadcrumbs.
- `src/components/ObsidianGraph.tsx`: 60 FPS force-directed physics graph with Coulomb repulsion and Hooke spring links.
- `src/engine/interpreter.ts`: Command parser, 50+ builtins, pipes, redirections, and chained commands.
- `src/engine/fs.ts`: Virtual in-memory filesystem tree and path resolution.
- `src/engine/brew.ts`: Homebrew package manager engine and runnable simulated formulas (`cowsay`, `neofetch`, `jq`, etc.).
- `src/engine/omz.ts`: Oh My Zsh theme engine and `.zshrc` simulation.
- `src/engine/storage.ts`: Persistent storage synchronization (`localStorage`) and snapshot export/import.
- `scripts/verify-terminal-suite.ts`: 39 automated integration tests validating terminal command execution.

---

## 📝 Submitting a Pull Request

1. Create a branch for your feature or bug fix:
   ```bash
   git checkout -b feat/my-cool-feature
   ```
2. Write tests or verify existing tests pass:
   ```bash
   bun test
   ```
3. Ensure the project builds cleanly:
   ```bash
   bun run build
   ```
4. Commit your changes with clear, semantic commit messages:
   ```bash
   git commit -m 'feat(interpreter): add cal command'
   ```
5. Push to your fork and open a Pull Request against `main`.

---

## 🐛 Reporting Issues

Found a bug or have a suggestion? Open an issue on [GitHub Issues](https://github.com/heetwave16/slate_vision-cli/issues) with:
- A clear, descriptive title.
- Steps to reproduce the issue.
- Expected behavior vs. actual behavior.
- Browser and operating system version.

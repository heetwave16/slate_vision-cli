import type { EnvState, ExecResult, TermLine, TermSeg, VizEvent } from './types';
import { makeDir, makeFile, resolvePath, parentDir, ensureDir } from './fs';

export interface BrewFormula {
  name: string;
  version: string;
  desc: string;
  homepage: string;
  size: string;
  filesCount: number;
  execute: (args: string[], flags: string, stdin: string, env: EnvState) => { lines: TermLine[]; stdout: string; ok: boolean };
}

/* ------------------------------------------------------------------ */
/* Real Functioning Package Implementations                           */
/* ------------------------------------------------------------------ */

function renderCowsay(text: string): string {
  const msg = text || 'Moo! Shellscope virtual terminal is alive!';
  const borderLine = '-'.repeat(msg.length + 2);
  return [
    `  ${borderLine}`,
    ` < ${msg} >`,
    `  ${borderLine}`,
    `        \\   ^__^`,
    `         \\  (oo)\\_______`,
    `            (__)\\       )\\/\\`,
    `                ||----w |`,
    `                ||     ||`,
  ].join('\n');
}

function renderFiglet(text: string): string {
  const word = (text || 'SHELL').toUpperCase().slice(0, 12);
  const letters: Record<string, string[]> = {
    'A': ['  ████   ', ' ██  ██  ', '████████ ', '██    ██ ', '██    ██ '],
    'B': ['██████   ', '██   ██  ', '██████   ', '██   ██  ', '██████   '],
    'C': [' ██████  ', '██       ', '██       ', '██       ', ' ██████  '],
    'D': ['██████   ', '██   ██  ', '██   ██  ', '██   ██  ', '██████   '],
    'E': ['████████ ', '██       ', '█████    ', '██       ', '████████ '],
    'F': ['████████ ', '██       ', '█████    ', '██       ', '██       '],
    'G': [' ██████  ', '██       ', '██   ███ ', '██    ██ ', ' ██████  '],
    'H': ['██    ██ ', '██    ██ ', '████████ ', '██    ██ ', '██    ██ '],
    'I': ['████████ ', '   ██    ', '   ██    ', '   ██    ', '████████ '],
    'J': ['   █████ ', '      ██ ', '      ██ ', '██    ██ ', ' ██████  '],
    'K': ['██    ██ ', '██   ██  ', '█████    ', '██   ██  ', '██    ██ '],
    'L': ['██       ', '██       ', '██       ', '██       ', '████████ '],
    'M': ['██    ██ ', '███  ███ ', '██ ██ ██ ', '██    ██ ', '██    ██ '],
    'N': ['██    ██ ', '███   ██ ', '██ █  ██ ', '██  █ ██ ', '██   ███ '],
    'O': [' ██████  ', '██    ██ ', '██    ██ ', '██    ██ ', ' ██████  '],
    'P': ['██████   ', '██   ██  ', '██████   ', '██       ', '██       '],
    'Q': [' ██████  ', '██    ██ ', '██    ██ ', '██   ██  ', ' █████ █ '],
    'R': ['██████   ', '██   ██  ', '██████   ', '██   ██  ', '██    ██ '],
    'S': [' ██████  ', '██       ', ' ██████  ', '      ██ ', '██████   '],
    'T': ['████████ ', '   ██    ', '   ██    ', '   ██    ', '   ██    '],
    'U': ['██    ██ ', '██    ██ ', '██    ██ ', '██    ██ ', ' ██████  '],
    'V': ['██    ██ ', '██    ██ ', ' ██  ██  ', '  ████   ', '   ██    '],
    'W': ['██    ██ ', '██    ██ ', '██ ██ ██ ', '███  ███ ', '██    ██ '],
    'X': ['██    ██ ', ' ██  ██  ', '  ████   ', ' ██  ██  ', '██    ██ '],
    'Y': ['██    ██ ', ' ██  ██  ', '   ██    ', '   ██    ', '   ██    '],
    'Z': ['████████ ', '     ██  ', '   ██    ', '  ██     ', '████████ '],
    ' ': ['         ', '         ', '         ', '         ', '         '],
  };

  const rows = ['', '', '', '', ''];
  for (const ch of word) {
    const glyph = letters[ch] ?? letters[' '];
    for (let r = 0; r < 5; r++) {
      rows[r] += glyph[r];
    }
  }
  return rows.join('\n');
}

export const FORMULA_REGISTRY: Record<string, BrewFormula> = {
  cowsay: {
    name: 'cowsay',
    version: '3.04',
    desc: 'Configurable talking characters in ASCII art',
    homepage: 'https://github.com/tnalpgge/rank-amateur-cowsay',
    size: '48KB',
    filesCount: 6,
    execute: (args, _flags, stdin) => {
      const input = args.join(' ') || stdin || 'Moo! Virtual sandbox is running.';
      const output = renderCowsay(input);
      return {
        lines: output.split('\n').map(l => ({ segs: [{ t: l, c: 'ok' as const }] })),
        stdout: output,
        ok: true,
      };
    },
  },

  figlet: {
    name: 'figlet',
    version: '2.2.5',
    desc: 'Banner-like lettering generator using ordinary text',
    homepage: 'http://www.figlet.org/',
    size: '180KB',
    filesCount: 12,
    execute: (args, _flags, stdin) => {
      const text = args.join(' ') || stdin || 'SANDBOX';
      const output = renderFiglet(text);
      return {
        lines: output.split('\n').map(l => ({ segs: [{ t: l, c: 'amber' as const, b: true }] })),
        stdout: output,
        ok: true,
      };
    },
  },

  neofetch: {
    name: 'neofetch',
    version: '7.1.0',
    desc: 'Fast, highly customizable system info script',
    homepage: 'https://github.com/dylanaraps/neofetch',
    size: '142KB',
    filesCount: 8,
    execute: (_args, _flags, _stdin, env) => {
      const brewCount = Object.keys(env.installedBrew ?? {}).length;
      const npmCount = env.packages.length;
      const theme = env.promptTheme ?? 'default';

      const specs: [string, string, string?][] = [
        ['OS', 'Shellscope Linux 6.1.0-viz x86_64', 'fg'],
        ['Host', 'In-Memory Persistent Virtual Machine', 'dim'],
        ['Kernel', '6.1.0-viz-release', 'fg'],
        ['Uptime', '4 hours, 18 mins', 'dim'],
        ['Packages', `${brewCount} (brew), ${npmCount} (npm)`, 'ok'],
        ['Shell', 'zsh 5.9 (virtual sandbox)', 'info'],
        ['Theme', theme, 'amber'],
        ['Terminal', 'xterm-shellscope-v2', 'fg'],
        ['CPU', 'Virtual WebAssembly Core (4) @ 3.40GHz', 'dim'],
        ['Memory', '186MiB / 2048MiB', 'info'],
      ];

      const logo = [
        '        .---.        ',
        '       /     \\       ',
        '      | () () |      ',
        '       \\  -  /       ',
        '        )---(        ',
        '       /     \\       ',
        '      / /|_|\\ \\      ',
        '     ( / / \\ \\ )     ',
        '      `"`   `"`      ',
        '                     ',
      ];

      const lines: TermLine[] = [];
      lines.push({
        segs: [
          { t: logo[0], c: 'cyan', b: true },
          { t: ` ${env.user}@${env.host}`, c: 'ok', b: true },
        ],
      });
      lines.push({
        segs: [
          { t: logo[1], c: 'cyan', b: true },
          { t: ` ${'-'.repeat(env.user.length + env.host.length + 1)}`, c: 'dim' },
        ],
      });

      for (let i = 0; i < specs.length; i++) {
        const logoPart = logo[i + 2] ?? '                     ';
        const [label, val, col] = specs[i];
        lines.push({
          segs: [
            { t: logoPart, c: 'cyan', b: true },
            { t: ` ${label}: `, c: 'info', b: true },
            { t: val, c: (col as any) ?? 'fg' },
          ],
        });
      }

      // Color blocks bar
      lines.push({
        segs: [
          { t: '                     ', c: 'dim' },
          { t: '███', c: 'err' },
          { t: '███', c: 'ok' },
          { t: '███', c: 'amber' },
          { t: '███', c: 'info' },
          { t: '███', c: 'violet' },
          { t: '███', c: 'cyan' },
        ],
      });

      return {
        lines,
        stdout: specs.map(([k, v]) => `${k}: ${v}`).join('\n'),
        ok: true,
      };
    },
  },

  jq: {
    name: 'jq',
    version: '1.7.1',
    desc: 'Lightweight and flexible command-line JSON processor',
    homepage: 'https://jqlang.github.io/jq/',
    size: '1.2MB',
    filesCount: 4,
    execute: (args, _flags, stdin, env) => {
      let rawJson = stdin;
      let filter = '.';
      if (args.length >= 2) {
        filter = args[0];
        const filePath = args[1];
        const res = resolvePath(env, filePath);
        if (res && res.node.content) rawJson = res.node.content;
      } else if (args.length === 1) {
        if (args[0].startsWith('.')) filter = args[0];
        else {
          const res = resolvePath(env, args[0]);
          if (res && res.node.content) rawJson = res.node.content;
        }
      }

      if (!rawJson.trim()) {
        return {
          lines: [{ segs: [{ t: 'jq: error: input JSON cannot be empty (try: cat package.json | jq .)', c: 'err' }] }],
          stdout: '',
          ok: false,
        };
      }

      try {
        const parsed = JSON.parse(rawJson);
        let result: any = parsed;
        const cleanFilter = filter.replace(/^\./, '');
        if (cleanFilter) {
          result = parsed[cleanFilter] ?? parsed;
        }
        const formatted = JSON.stringify(result, null, 2);
        return {
          lines: formatted.split('\n').map(l => ({ segs: [{ t: l, c: 'ok' as const }] })),
          stdout: formatted,
          ok: true,
        };
      } catch (err) {
        return {
          lines: [{ segs: [{ t: `jq: parse error: ${(err as Error).message}`, c: 'err' }] }],
          stdout: '',
          ok: false,
        };
      }
    },
  },

  bat: {
    name: 'bat',
    version: '0.24.0',
    desc: 'A cat clone with syntax highlighting and Git integration',
    homepage: 'https://github.com/sharkdp/bat',
    size: '2.4MB',
    filesCount: 14,
    execute: (args, _flags, stdin, env) => {
      const target = args[0];
      let content = stdin;
      let title = 'stdin';
      if (target) {
        const res = resolvePath(env, target);
        if (!res) {
          return {
            lines: [{ segs: [{ t: `bat: '${target}': No such file or directory`, c: 'err' }] }],
            stdout: '',
            ok: false,
          };
        }
        content = res.node.content ?? '';
        title = res.node.name;
      }

      const lines: TermLine[] = [];
      const border = '─'.repeat(54);
      lines.push({ segs: [{ t: `───────┬${border}`, c: 'dim' }] });
      lines.push({
        segs: [
          { t: '  FILE │ ', c: 'dim', b: true },
          { t: title, c: 'info', b: true },
        ],
      });
      lines.push({ segs: [{ t: `───────┼${border}`, c: 'dim' }] });

      const contentLines = content.split('\n');
      contentLines.forEach((l, i) => {
        lines.push({
          segs: [
            { t: String(i + 1).padStart(6) + ' │ ', c: 'dim' },
            { t: l, c: 'fg' },
          ],
        });
      });
      lines.push({ segs: [{ t: `───────┴${border}`, c: 'dim' }] });

      return {
        lines,
        stdout: content,
        ok: true,
      };
    },
  },

  ripgrep: {
    name: 'ripgrep',
    version: '14.1.0',
    desc: 'Line-oriented search tool that recursively searches current directory',
    homepage: 'https://github.com/BurntSushi/ripgrep',
    size: '3.1MB',
    filesCount: 8,
    execute: (args, _flags, _stdin, env) => {
      const query = args[0];
      if (!query) {
        return {
          lines: [{ segs: [{ t: 'rg: error: pattern required (usage: rg <pattern> [path])', c: 'err' }] }],
          stdout: '',
          ok: false,
        };
      }
      const lines: TermLine[] = [];
      let totalMatches = 0;

      const walk = (node: any, path: string) => {
        if (node.type === 'file' && node.content) {
          const fileLines = node.content.split('\n');
          fileLines.forEach((l: string, idx: number) => {
            if (l.toLowerCase().includes(query.toLowerCase())) {
              totalMatches++;
              lines.push({
                segs: [
                  { t: path.replace(/^\/home\/user\/?/, '~/') + ':', c: 'violet', b: true },
                  { t: String(idx + 1) + ':', c: 'ok' },
                  { t: l, c: 'fg' },
                ],
              });
            }
          });
        }
        if (node.children) {
          for (const c of node.children) {
            walk(c, path + '/' + c.name);
          }
        }
      };

      walk(env.fs, '/home/user');

      if (totalMatches === 0) {
        lines.push({ segs: [{ t: `rg: no matches found for '${query}'`, c: 'dim' }] });
      }

      return {
        lines,
        stdout: lines.map(l => l.segs.map(s => s.t).join('')).join('\n'),
        ok: true,
      };
    },
  },

  htop: {
    name: 'htop',
    version: '3.3.0',
    desc: 'Interactive process viewer and system monitor',
    homepage: 'https://htop.dev/',
    size: '410KB',
    filesCount: 10,
    execute: () => {
      const lines: TermLine[] = [];
      lines.push({ segs: [{ t: '  1  [|||||||||||||||||||| 42.0%]   Tasks: 48, 1 thr; 1 running', c: 'ok', b: true }] });
      lines.push({ segs: [{ t: '  2  [||||||||||            24.5%]   Load average: 0.14 0.08 0.03', c: 'cyan', b: true }] });
      lines.push({ segs: [{ t: '  Mem[||||||||||||||   186M/2.00G]   Uptime: 04:22:15', c: 'amber', b: true }] });
      lines.push({ segs: [{ t: '  Swp[                   0K/1.00G]', c: 'dim' }] });
      lines.push({ segs: [{ t: '────────────────────────────────────────────────────────────────────────', c: 'dim' }] });
      lines.push({ segs: [{ t: '  PID USER      PRI  NI  VIRT   RES   SHR S CPU% MEM%   TIME+  Command', c: 'info', b: true }] });
      lines.push({ segs: [{ t: '  101 dev        20   0  342M   48M   12M S  6.2  2.4  0:04.12 zsh (interactive)', c: 'fg' }] });
      lines.push({ segs: [{ t: '  142 dev        20   0  580M   86M   24M S  3.4  4.2  0:12.80 vite --host', c: 'fg' }] });
      lines.push({ segs: [{ t: '  204 dev        20   0  210M   28M    8M S  1.1  1.4  0:01.05 storage-daemon', c: 'dim' }] });
      lines.push({ segs: [{ t: '  256 dev        20   0  140M   16M    4M R  0.8  0.8  0:00.18 htop', c: 'ok' }] });
      return {
        lines,
        stdout: 'htop process snapshot ok',
        ok: true,
      };
    },
  },
};

/* ------------------------------------------------------------------ */
/* Homebrew Command Handler                                            */
/* ------------------------------------------------------------------ */

export function handleBrewCommand(
  args: string[],
  env: EnvState,
  onStageEvent?: (kind: any, payload: any, dur: number) => void
): { lines: TermLine[]; events: VizEvent[]; ok: boolean } {
  const sub = args[0] ?? 'help';
  const target = args[1]?.toLowerCase();
  const lines: TermLine[] = [];
  const events: VizEvent[] = [];

  if (!env.installedBrew) env.installedBrew = {};

  if (sub === 'install') {
    if (!target) {
      lines.push({ segs: [{ t: 'Usage: brew install <formula>', c: 'err' }] });
      return { lines, events, ok: false };
    }

    const formula = FORMULA_REGISTRY[target];
    if (!formula) {
      lines.push({
        segs: [
          { t: `Error: No available formula with the name "${target}".`, c: 'err', b: true },
        ],
      });
      lines.push({
        segs: [
          { t: `Available formulas in Shellscope Core: `, c: 'dim' },
          { t: Object.keys(FORMULA_REGISTRY).join(', '), c: 'info' },
        ],
      });
      return { lines, events, ok: false };
    }

    if (env.installedBrew[target]) {
      lines.push({
        segs: [
          { t: `Warning: ${target} ${formula.version} is already installed and up-to-date.`, c: 'amber' },
        ],
      });
      return { lines, events, ok: true };
    }

    // Install formula
    env.installedBrew[target] = {
      version: formula.version,
      bin: `/home/user/.brew/bin/${target}`,
      formula: target,
      desc: formula.desc,
      installedAt: Date.now(),
    };

    // Ensure virtual directories exist
    ensureDir(env, '/home/user/.brew/bin');
    ensureDir(env, `/home/user/.brew/Cellar/${target}/${formula.version}`);

    // Create simulated binary in ~/.brew/bin
    const binRes = resolvePath(env, '/home/user/.brew/bin');
    if (binRes && binRes.node.children) {
      binRes.node.children.push(makeFile(env, target, `#!/usr/bin/env sh\n# Shellscope Virtual Binary: ${target} v${formula.version}\n`));
    }

    // Emit installation stage animation
    events.push({
      kind: 'stage',
      stage: 'npm', // Reuse rich package resolver visualizer
      payload: {
        cmd: `brew install ${target}`,
        packages: [
          { name: target, version: formula.version, size: formula.size },
        ],
      },
      duration: 3200,
    });

    events.push({
      kind: 'log',
      tag: 'sys',
      text: `brew: installed ${target} ${formula.version} (${formula.size})`,
      color: '#83b394',
    });

    lines.push({ segs: [{ t: `==> Downloading https://ghcr.io/v2/homebrew/core/${target}/manifests/${formula.version}`, c: 'info', b: true }] });
    lines.push({ segs: [{ t: `==> Fetching ${target} bottle...`, c: 'dim' }] });
    lines.push({ segs: [{ t: `==> Pouring ${target}-${formula.version}.arm64_sequoia.bottle.tar.gz`, c: 'dim' }] });
    lines.push({
      segs: [
        { t: `🍺  /home/user/.brew/Cellar/${target}/${formula.version}: `, c: 'ok', b: true },
        { t: `${formula.filesCount} files, ${formula.size}`, c: 'dim' },
      ],
    });
    lines.push({ segs: [{ t: `==> Linked: /home/user/.brew/bin/${target}`, c: 'ok' }] });
    lines.push({
      segs: [
        { t: `✓ Ready! You can now run `, c: 'dim' },
        { t: target, c: 'ok', b: true },
        { t: ` directly in the terminal.`, c: 'dim' },
      ],
    });

    return { lines, events, ok: true };
  }

  if (sub === 'list') {
    const installed = Object.keys(env.installedBrew);
    if (!installed.length) {
      lines.push({ segs: [{ t: 'No Homebrew packages installed yet. (Try: brew install cowsay)', c: 'dim' }] });
    } else {
      lines.push({ segs: [{ t: '==> Installed Homebrew Formulas:', c: 'info', b: true }] });
      installed.forEach(name => {
        const item = env.installedBrew![name];
        lines.push({
          segs: [
            { t: `  🍺 ${name.padEnd(14)}`, c: 'ok', b: true },
            { t: `v${item.version.padEnd(10)}`, c: 'dim' },
            { t: item.desc, c: 'fg' },
          ],
        });
      });
    }
    return { lines, events, ok: true };
  }

  if (sub === 'info') {
    if (!target) {
      lines.push({ segs: [{ t: 'Usage: brew info <formula>', c: 'err' }] });
      return { lines, events, ok: false };
    }
    const formula = FORMULA_REGISTRY[target];
    if (!formula) {
      lines.push({ segs: [{ t: `Error: No available formula with the name "${target}".`, c: 'err' }] });
      return { lines, events, ok: false };
    }
    const isInstalled = !!env.installedBrew[target];
    lines.push({
      segs: [
        { t: `==> ${formula.name}: `, c: 'info', b: true },
        { t: formula.desc, c: 'fg' },
      ],
    });
    lines.push({ segs: [{ t: formula.homepage, c: 'cyan' }] });
    lines.push({
      segs: [
        { t: `Installed: `, c: 'dim' },
        { t: isInstalled ? `Yes (v${formula.version})` : 'Not installed', c: isInstalled ? 'ok' : 'dim', b: isInstalled },
        { t: ` · Size: ${formula.size}`, c: 'dim' },
      ],
    });
    return { lines, events, ok: true };
  }

  if (sub === 'uninstall' || sub === 'remove') {
    if (!target || !env.installedBrew[target]) {
      lines.push({ segs: [{ t: `Error: No such formula installed: ${target ?? ''}`, c: 'err' }] });
      return { lines, events, ok: false };
    }
    delete env.installedBrew[target];
    lines.push({ segs: [{ t: `Uninstalling /home/user/.brew/Cellar/${target}... (${FORMULA_REGISTRY[target]?.filesCount ?? 8} files)`, c: 'dim' }] });
    lines.push({ segs: [{ t: `✓ Successfully uninstalled ${target}.`, c: 'ok' }] });
    events.push({
      kind: 'log',
      tag: 'sys',
      text: `brew: uninstalled ${target}`,
      color: '#cf8790',
    });
    return { lines, events, ok: true };
  }

  if (sub === 'update') {
    lines.push({ segs: [{ t: '==> Updating Homebrew Core Repository...', c: 'info' }] });
    lines.push({ segs: [{ t: 'Already up-to-date. Available formulas: ' + Object.keys(FORMULA_REGISTRY).join(', '), c: 'ok' }] });
    return { lines, events, ok: true };
  }

  // Fallback help
  lines.push({ segs: [{ t: 'Homebrew 4.2.0 (Shellscope Virtual Core)', c: 'amber', b: true }] });
  lines.push({ segs: [{ t: 'Usage: brew <command> [options]', c: 'dim' }] });
  lines.push({ segs: [{ t: '  brew install <formula>   Install a formula (e.g. cowsay, neofetch, jq, figlet, bat, ripgrep)', c: 'fg' }] });
  lines.push({ segs: [{ t: '  brew list                List installed formulas', c: 'fg' }] });
  lines.push({ segs: [{ t: '  brew info <formula>      Show formula metadata', c: 'fg' }] });
  lines.push({ segs: [{ t: '  brew uninstall <formula> Remove an installed formula', c: 'fg' }] });
  lines.push({ segs: [{ t: '  brew update              Check for formula updates', c: 'fg' }] });

  return { lines, events, ok: true };
}

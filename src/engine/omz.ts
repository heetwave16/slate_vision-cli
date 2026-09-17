import type { EnvState, TermLine, TermSeg, VizEvent } from './types';
import { makeDir, makeFile, ensureDir, resolvePath } from './fs';

export const OMZ_THEMES = ['robbyrussell', 'agnoster', 'powerlevel10k', 'minimal', 'default'];

export const OMZ_PLUGINS = ['git', 'zsh-syntax-highlighting', 'zsh-autosuggestions', 'node', 'npm', 'brew'];

const DEFAULT_ZSHRC = `# Path to your Oh My Zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load
ZSH_THEME="robbyrussell"

# Which plugins would you like to load?
plugins=(git zsh-syntax-highlighting zsh-autosuggestions)

source $ZSH/oh-my-zsh.sh

# User configuration
export PATH="$HOME/.brew/bin:$PATH"
alias ll="ls -la"
`;

export function handleOmzCommand(
  args: string[],
  env: EnvState
): { lines: TermLine[]; events: VizEvent[]; ok: boolean } {
  const sub = args[0] ?? 'help';
  const target = args[1]?.toLowerCase();
  const lines: TermLine[] = [];
  const events: VizEvent[] = [];

  if (sub === 'install') {
    ensureDir(env, '/home/user/.oh-my-zsh/themes');
    ensureDir(env, '/home/user/.oh-my-zsh/plugins');

    const zshrcRes = resolvePath(env, '/home/user/.zshrc');
    if (!zshrcRes) {
      const homeRes = resolvePath(env, '/home/user');
      if (homeRes && homeRes.node.children) {
        homeRes.node.children.push(makeFile(env, '.zshrc', DEFAULT_ZSHRC));
      }
    }

    env.promptTheme = 'robbyrussell';

    lines.push({
      segs: [
        { t: '         __                                     __   ', c: 'amber', b: true },
      ],
    });
    lines.push({
      segs: [
        { t: '  ____  / /_     ____ ___  __  __   ____  _____/ /_  ', c: 'amber', b: true },
      ],
    });
    lines.push({
      segs: [
        { t: ' / __ \\/ __ \\   / __ `__ \\/ / / /  /_  / / ___/ __ \\ ', c: 'amber', b: true },
      ],
    });
    lines.push({
      segs: [
        { t: '/ /_/ / / / /  / / / / / / /_/ /    / /_(__  ) / / / ', c: 'amber', b: true },
      ],
    });
    lines.push({
      segs: [
        { t: '\\____/_/ /_/  /_/ /_/ /_/\\__, /    /___/____/_/ /_/  ', c: 'amber', b: true },
      ],
    });
    lines.push({
      segs: [
        { t: '                        /____/                       ', c: 'amber', b: true },
      ],
    });
    lines.push({ segs: [{ t: '', c: 'dim' }] });
    lines.push({ segs: [{ t: '✔ Installed Oh My Zsh into ~/.oh-my-zsh', c: 'ok', b: true }] });
    lines.push({ segs: [{ t: '✔ Created ~/.zshrc with default configuration', c: 'ok' }] });
    lines.push({ segs: [{ t: '✔ Active theme set to robbyrussell (classic arrow prompt)', c: 'info' }] });
    lines.push({
      segs: [
        { t: '💡 Try changing themes: ', c: 'dim' },
        { t: 'omz theme agnoster', c: 'ok', b: true },
        { t: ' or ', c: 'dim' },
        { t: 'omz theme powerlevel10k', c: 'ok', b: true },
      ],
    });

    events.push({
      kind: 'log',
      tag: 'sys',
      text: 'oh-my-zsh installed — theme robbyrussell activated',
      color: '#c4a46b',
    });

    return { lines, events, ok: true };
  }

  if (sub === 'theme') {
    if (!target) {
      lines.push({ segs: [{ t: `Current prompt theme: ${env.promptTheme ?? 'default'}`, c: 'info', b: true }] });
      lines.push({ segs: [{ t: `Available themes: ${OMZ_THEMES.join(', ')}`, c: 'dim' }] });
      return { lines, events, ok: true };
    }

    if (!OMZ_THEMES.includes(target)) {
      lines.push({ segs: [{ t: `Unknown theme "${target}". Available: ${OMZ_THEMES.join(', ')}`, c: 'err' }] });
      return { lines, events, ok: false };
    }

    env.promptTheme = target;

    // Update .zshrc if present
    const zshrc = resolvePath(env, '/home/user/.zshrc');
    if (zshrc && zshrc.node.content) {
      zshrc.node.content = zshrc.node.content.replace(/ZSH_THEME="[^"]*"/, `ZSH_THEME="${target}"`);
    }

    lines.push({
      segs: [
        { t: '✔ Switched terminal theme to ', c: 'ok' },
        { t: target, c: 'amber', b: true },
      ],
    });

    events.push({
      kind: 'log',
      tag: 'sys',
      text: `omz: prompt theme set to ${target}`,
      color: '#c4a46b',
    });

    return { lines, events, ok: true };
  }

  if (sub === 'list') {
    lines.push({ segs: [{ t: '==> Oh My Zsh Themes:', c: 'info', b: true }] });
    OMZ_THEMES.forEach(t => {
      const isCurrent = (env.promptTheme ?? 'default') === t;
      lines.push({
        segs: [
          { t: `  ${isCurrent ? '●' : '○'} ${t.padEnd(16)}`, c: isCurrent ? 'ok' : 'fg', b: isCurrent },
          { t: isCurrent ? '(current)' : '', c: 'amber' },
        ],
      });
    });
    lines.push({ segs: [{ t: '==> Oh My Zsh Built-in Plugins:', c: 'info', b: true }] });
    lines.push({ segs: [{ t: `  ${OMZ_PLUGINS.join(', ')}`, c: 'dim' }] });
    return { lines, events, ok: true };
  }

  // Help
  lines.push({ segs: [{ t: 'Oh My Zsh CLI (Virtual Sandbox Edition)', c: 'amber', b: true }] });
  lines.push({ segs: [{ t: 'Usage: omz <command> [argument]', c: 'dim' }] });
  lines.push({ segs: [{ t: '  omz install         Install Oh My Zsh and scaffold ~/.zshrc', c: 'fg' }] });
  lines.push({ segs: [{ t: '  omz theme <name>    Switch prompt theme (robbyrussell, agnoster, powerlevel10k, minimal, default)', c: 'fg' }] });
  lines.push({ segs: [{ t: '  omz list            List available themes and active plugins', c: 'fg' }] });

  return { lines, events, ok: true };
}

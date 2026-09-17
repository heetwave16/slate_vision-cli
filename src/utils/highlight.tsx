import { cn } from './cn';

export function highlightCode(text: string, ext: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    let tokens: { text: string; color?: string; bold?: boolean }[] = [];

    if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
      tokens = [{ text: line, color: 'text-[var(--text-muted)] italic' }];
    } else if (ext === 'json') {
      const parts = line.split(/("(?:[^"\\]|\\.)*")/);
      tokens = parts.map((part) => {
        if (part.startsWith('"') && part.endsWith('"')) {
          if (part.includes(':') || line.indexOf(part) < line.indexOf(':')) {
            return { text: part, color: 'text-[var(--text-primary)] font-medium' };
          }
          return { text: part, color: 'text-[var(--semantic-success)]' };
        }
        if (/^-?\d+(\.\d+)?$/.test(part.trim())) {
          return { text: part, color: 'text-[var(--semantic-warning)]' };
        }
        return { text: part, color: 'text-[var(--text-secondary)]' };
      });
    } else {
      const parts = line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:import|export|const|let|var|function|return|if|else|from|class|extends|async|await|try|catch)\b)/);
      tokens = parts.map((part) => {
        if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
          return { text: part, color: 'text-[var(--semantic-success)]' };
        }
        if (/^(import|export|const|let|var|function|return|if|else|from|class|extends|async|await|try|catch)$/.test(part)) {
          return { text: part, color: 'text-[var(--text-primary)] font-semibold' };
        }
        if (/^-?\d+(\.\d+)?$/.test(part.trim())) {
          return { text: part, color: 'text-[var(--semantic-warning)]' };
        }
        return { text: part, color: 'text-[var(--text-secondary)]' };
      });
    }

    return (
      <div key={lineIdx} className="flex min-w-0 font-mono text-[12px] leading-[1.55]">
        <span className="w-8 shrink-0 select-none pr-3 text-right text-[var(--text-muted)] opacity-60">
          {lineIdx + 1}
        </span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-[var(--text-primary)]">
          {tokens.map((tok, ti) => (
            <span key={ti} className={cn(tok.color, tok.bold && 'font-semibold')}>
              {tok.text}
            </span>
          ))}
        </span>
      </div>
    );
  });
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { liveBus } from './liveBus';
import type { VizEvent } from '../engine/types';

/* ================================================================== */
/*  Live mode — the REAL shell (zsh) rendered with xterm.js, driven   */
/*  by local-daemon. See docs/REAL_MAC_TERMINAL.md for architecture.  */
/* ================================================================== */

type Status = 'idle' | 'connecting' | 'live' | 'error';

const DEFAULT_URL = 'ws://127.0.0.1:8787';

export default function LivePanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState(DEFAULT_URL);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [lastCmd, setLastCmd] = useState('');

  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<{ dispose: () => void } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(async () => {
    setError('');
    setStatus('connecting');
    try {
      // lazy-load xterm so the sandbox bundle stays lean
      const { Terminal: XTerm } = await import('@xterm/xterm');
      const css = (await import('@xterm/xterm/css/xterm.css?inline')).default as string;
      if (!document.getElementById('xterm-css')) {
        const tag = document.createElement('style');
        tag.id = 'xterm-css';
        tag.textContent = css;
        document.head.appendChild(tag);
      }

      const term = new XTerm({
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 13,
        cursorBlink: true,
        theme: {
          background: '#0d1219',
          foreground: '#d9e2ec',
          cursor: '#53c7f0',
          selectionBackground: 'rgba(83,199,240,0.3)',
        },
      });
      if (termRef.current) term.open(termRef.current);
      const fit = () => {
        if (termRef.current) {
          const cols = Math.max(20, Math.floor(termRef.current.clientWidth / 7.8));
          const rows = Math.max(5, Math.floor(termRef.current.clientHeight / 19));
          term.resize(cols, rows);
          wsRef.current?.readyState === WebSocket.OPEN && wsRef.current?.send(JSON.stringify({ kind: 'resize', cols, rows }));
        }
      };
      const onResize = () => fit();
      window.addEventListener('resize', onResize);
      xtermRef.current = {
        dispose: () => {
          window.removeEventListener('resize', onResize);
          term.dispose();
        },
      };
      setTimeout(fit, 30);

      const ws = new WebSocket(url + (token ? `?token=${encodeURIComponent(token)}` : ''));
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('live');
        setLastCmd('');
        term.focus();
      };
      ws.onmessage = (m) => {
        let msg: any;
        try { msg = JSON.parse(m.data); } catch { return; }
        if (msg.kind === 'data' && typeof msg.data === 'string') {
          term.write(msg.data);
        } else if (msg.kind === 'event') {
          liveBus.emit(msg.event as VizEvent);
        } else if (msg.kind === 'cmd') {
          setLastCmd(msg.t === 'start' ? msg.line : `${msg.line}  ✔ ${msg.took}ms`);
        }
      };
      ws.onclose = () => {
        setStatus('error');
        setError(error || 'connection closed');
      };
      ws.onerror = () => {
        setStatus('error');
        setError(`cannot reach ${url} — is the daemon running?`);
      };
      term.onData(d => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ kind: 'input', data: d }));
      });
    } catch (e) {
      setStatus('error');
      setError(`xterm failed to load: ${(e as Error).message}`);
    }
  }, [url, token]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      xtermRef.current?.dispose();
      xtermRef.current = null;
    };
    // connect once on mount; url/token changes require a reconnect click
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dot = status === 'live' ? 'var(--semantic-success)' : status === 'connecting' ? 'var(--semantic-warning)' : 'var(--semantic-error)';

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[var(--surface-base)]">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3.5 py-2">
        <span className="h-2 w-2 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
        <span className="font-mono text-[11px] font-semibold tracking-wider text-[var(--text-primary)]">
          LIVE SHELL
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          real zsh · real binaries · observed previews
        </span>
        {lastCmd && (
          <span className="ml-2 max-w-[40%] truncate rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-0.5 font-mono text-[10px] text-[var(--semantic-info)]">
            $ {lastCmd}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            spellCheck={false}
            className="w-44 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--border-strong)]"
            title="Daemon WebSocket URL"
          />
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="token"
            spellCheck={false}
            className="w-20 rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--border-strong)]"
            title="Token printed by the daemon"
          />
          <button
            onClick={() => { xtermRef.current?.dispose(); xtermRef.current = null; connect(); }}
            className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
          >
            Reconnect
          </button>
          <button
            onClick={onClose}
            className="chip rounded border border-[var(--border-default)] bg-[var(--surface-card)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            ← Sandbox
          </button>
        </div>
      </div>

      {/* terminal / status area */}
      <div className="relative min-h-0 flex-1">
        <div ref={termRef} className="absolute inset-0 p-2" />
        {status !== 'live' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full max-w-lg rounded-lg border border-[var(--border-strong)] bg-[var(--surface-panel)] p-6">
              <div className="font-mono text-[13px] font-bold text-[var(--text-primary)]">
                {status === 'connecting' ? 'Connecting to local daemon…' : 'Live mode needs the local daemon'}
              </div>
              {error && <div className="mt-2 font-mono text-[11px] text-[var(--semantic-error)]">{error}</div>}
              <div className="mt-4 space-y-1.5 rounded border border-[var(--border-default)] bg-[var(--surface-base)] p-3 font-mono text-[11px] text-[var(--text-secondary)]">
                <div className="font-sans text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">In a real terminal on this Mac:</div>
                <div><span className="text-[var(--semantic-info)]">$</span> cd local-daemon && npm install</div>
                <div><span className="text-[var(--semantic-info)]">$</span> npm run live <span className="text-[var(--text-muted)]"># → prints ws://127.0.0.1:8787?token=…</span></div>
                <div className="pt-1 text-[var(--text-muted)]">Paste the token above (optional: change URL/cwd via env), then hit Reconnect.</div>
              </div>
              <div className="mt-3 font-mono text-[10px] text-[var(--text-muted)]">
                The daemon spawns your real $SHELL in a PTY and streams file/git/process
                side-effects as the same preview events the sandbox uses — StagePanels light up
                for genuinely real commands. See docs/REAL_MAC_TERMINAL.md.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

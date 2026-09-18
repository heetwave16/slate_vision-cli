import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Slate Uncaught Error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-ink-950 p-6 text-fg">
          <div className="w-full max-w-md rounded-lg border border-rose/50 bg-ink-900 p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose">
              <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2 className="font-display text-lg font-bold">Kernel Panic (Virtual)</h2>
            </div>
            <p className="mt-3 font-mono text-xs text-fg-dim">
              The virtual playground encountered an unexpected runtime exception.
            </p>
            {this.state.error && (
              <pre className="scroll-thin mt-4 max-h-36 overflow-auto rounded border border-ink-600/70 bg-ink-950 p-3 font-mono text-[11px] text-rose/90">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={this.handleReset}
                className="rounded border border-amber/60 bg-amber/15 px-3 py-1.5 font-mono text-xs font-bold text-amber hover:bg-amber/25"
              >
                Reset Sandbox & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

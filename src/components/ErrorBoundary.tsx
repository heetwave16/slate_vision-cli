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
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--surface-base)] p-6 text-[var(--text-primary)]">
          <div className="w-full max-w-md rounded-lg border border-[var(--semantic-error)]/50 bg-[var(--surface-panel)] p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-[var(--semantic-error)]">
              <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-current" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2 className="font-mono text-lg font-bold">Kernel Panic (Virtual)</h2>
            </div>
            <p className="mt-3 font-mono text-xs text-[var(--text-secondary)]">
              The virtual playground encountered an unexpected runtime exception.
            </p>
            {this.state.error && (
              <pre className="scroll-thin mt-4 max-h-36 overflow-auto rounded border border-[var(--border-default)] bg-[var(--surface-base)] p-3 font-mono text-[11px] text-[var(--semantic-error)]">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={this.handleReset}
                className="rounded border border-[var(--semantic-warning)]/60 bg-[var(--semantic-warning)]/15 px-3 py-1.5 font-mono text-xs font-bold text-[var(--semantic-warning)] hover:bg-[var(--semantic-warning)]/25 transition-colors"
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

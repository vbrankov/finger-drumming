import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Shows the error instead of a blank page, with a way out. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="app">
        <h2>Something broke</h2>
        <pre className="panel" style={{ whiteSpace: 'pre-wrap' }}>
          {error.message}
          {'\n'}
          {error.stack}
        </pre>
        <div className="row">
          <button className="primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="danger"
            onClick={() => {
              if (!confirm('Delete all songs, kits, scores and settings stored in this browser?')) return;
              localStorage.clear();
              location.reload();
            }}
          >
            Reset local data
          </button>
        </div>
        <p className="muted small">If this keeps happening, please report the message above.</p>
      </div>
    );
  }
}

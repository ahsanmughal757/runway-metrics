import type { ReactNode } from 'react';
import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  /**
   * `panel` (the default) sits inside the app shell; `full` takes over the whole
   * viewport.
   *
   * This exists because the boundary used to wrap only the authenticated branch.
   * `/login`, `/signup` and `/share/:token` had none at all, so a throw in any of
   * them unmounted the entire React tree to a blank page - no message, no retry,
   * and the failure looked like a broken deploy rather than a broken component.
   */
  variant?: 'panel' | 'full';
}
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // The only error sink in the app today. Phase 6 replaces this with real
    // error reporting; until then this is the line to look for in a browser
    // console when a page comes up blank.
    console.error('Runway UI error boundary caught:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const body = (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <AlertTriangle size={28} className="text-runway-negative" />
        <p className="font-medium text-runway-text">Something went wrong rendering this view.</p>
        <p className="max-w-sm text-sm text-runway-muted">{this.state.error.message}</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-1 text-sm text-runway-accent underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );

    if (this.props.variant === 'full') {
      return <div className="flex min-h-screen items-center justify-center bg-runway-bg">{body}</div>;
    }
    return body;
  }
}

import type { ReactNode } from 'react';
import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '../lib/errorReporting';

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
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Was the only error sink in the app: a `console.error` and no destination.
    // A blank page in production produced nothing to look at but the browser
    // console of whichever machine happened to have it open, so a real fault
    // and a fault nobody had hit yet looked identical. `reportError` still
    // writes to the console, so this is a superset of the old behaviour rather
    // than a replacement of it.
    reportError(error, {
      source: 'error-boundary',
      componentStack: typeof info === 'object' && info !== null && 'componentStack' in info ? String(info.componentStack) : undefined,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    const body = (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <AlertTriangle size={28} className="text-runway-negative" />
        <p className="font-medium text-runway-text">Something went wrong rendering this view.</p>
        <p className="max-w-sm text-sm text-runway-muted">{this.state.error.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-1 text-sm text-runway-accent underline underline-offset-2">
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

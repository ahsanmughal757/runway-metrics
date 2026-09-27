import type { ReactNode } from 'react';
import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
     
    console.error('Runway UI error boundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertTriangle size={28} className="text-runway-negative" />
          <p className="text-runway-text font-medium">Something went wrong rendering this view.</p>
          <p className="text-runway-muted text-sm max-w-sm">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-sm text-runway-accent underline underline-offset-2 mt-1"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@heroui/react';
import { ApiError } from '../lib/api';

interface ErrorStateProps {
  /**
   * Whatever the fetch threw. Accepting `unknown` rather than `string` means a
   * page can hand over the raw rejection without unwrapping it first, which is
   * how five of these call sites ended up with no error handling at all: there
   * was no obvious place to put the result.
   */
  error: unknown;
  /** Overrides the derived heading. */
  title?: string;
  onRetry?: () => void;
}

/**
 * The failure state for a page whose data could not be loaded.
 *
 * Every list page had a `null` sentinel for "still loading" and no error branch
 * at all, so a failed fetch left the skeleton on screen forever: the request
 * threw, nothing caught it, and the one piece of state that decided what to
 * render was never written. A user could not tell a page that was slow from a
 * page that had failed, and had no way to try again without a full reload.
 *
 * A network failure and a server refusal are shown differently on purpose. "We
 * could not reach the server" and "you are not allowed to see this" need
 * different actions from the reader, and lumping them together produces advice
 * that is wrong for one of them — which is how a page ended up telling anyone
 * whose session had expired to go and enable the database.
 */
export function ErrorState({ error, title, onRetry }: ErrorStateProps) {
  const isApi = error instanceof ApiError;
  const offline = isApi && error.isNetwork;
  const message = error instanceof Error ? error.message : 'Something went wrong.';

  const heading = title ?? (offline ? 'Cannot reach the server' : 'Could not load this');

  return (
    <div className="runway-card flex flex-col items-center gap-3 border border-runway-negative/25 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-runway-negative/10">
        {offline ? (
          <WifiOff size={22} className="text-runway-negative" aria-hidden />
        ) : (
          <AlertTriangle size={22} className="text-runway-negative" aria-hidden />
        )}
      </div>
      <p className="font-medium text-runway-text">{heading}</p>
      <p className="max-w-sm text-sm text-runway-muted">
        {offline ? 'The API did not respond. Check that the backend is running, then try again.' : message}
      </p>
      {isApi && error.requestId && (
        <p className="text-xs text-runway-muted/70">
          Reference <code className="font-mono">{error.requestId}</code>
        </p>
      )}
      {onRetry && (
        <Button size="sm" variant="flat" className="mt-1" startContent={<RefreshCw size={14} />} onPress={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

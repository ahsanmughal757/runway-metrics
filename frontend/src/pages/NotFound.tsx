import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * The 404 route.
 *
 * An unknown URL used to match no route in any of the three `<Routes>` trees and
 * fall through to the app branch, which rendered the full AppShell - sidebar,
 * top bar, all eighteen nav links - wrapped around a completely empty `<main>`.
 * A silent blank page with an HTTP 200, which is worse than a wrong page: the
 * chrome says "you are in the app" and the content says nothing at all.
 *
 * This lives inside the app branch, so it is deliberately *not* styled as a
 * full-screen auth-style page. The user is still signed in; they just asked for
 * something that does not exist, and offering the rest of the app is the useful
 * response.
 */
export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-runway-accent/10">
        <Compass size={26} className="text-runway-accent" aria-hidden />
      </div>
      <div>
        <h1 className="font-condensed text-2xl font-bold text-runway-text">Page not found</h1>
        <p className="mt-1 max-w-sm text-sm text-runway-muted">
          That address does not match anything in the app. It may have been renamed, or the link may have a typo.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-xl bg-accent-gradient px-4 py-2 text-sm font-medium text-white shadow-glow"
        >
          Back to dashboard
        </Link>
        <Link to="/settings" className="text-sm text-runway-muted underline underline-offset-2 hover:text-runway-text">
          Settings
        </Link>
      </div>
    </div>
  );
}

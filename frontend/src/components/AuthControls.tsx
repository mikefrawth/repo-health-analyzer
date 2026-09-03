/**
 * The header's identity slot: a login link when signed out, username +
 * logout button when signed in. Pure presentation — `layout.tsx` decides
 * which state applies by resolving the session server-side.
 */

export function AuthControls({ githubUsername }: { githubUsername: string | null }) {
  if (!githubUsername) {
    return (
      <a
        href="/auth/login"
        className="text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        Log in with GitHub
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm text-slate-500">
      <span>{githubUsername}</span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="transition-colors hover:text-slate-900">
          Log out
        </button>
      </form>
    </div>
  );
}

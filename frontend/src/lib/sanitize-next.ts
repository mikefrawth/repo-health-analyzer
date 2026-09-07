/**
 * Guarding the `next` redirect target that rides through GitHub OAuth
 * (`/auth/login` -> `/auth/callback`). An open-redirect guard is precisely
 * the code that must not drift between its two call sites, so it lives here
 * once rather than copied.
 */

/** Only ever redirect back into this app, never to an attacker-chosen host. */
export function sanitizeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

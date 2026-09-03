/**
 * The owner-only visibility slot on a Report page: a status label, plus a
 * "Make public" button when the Report is private and eligible. Pure
 * presentation — the page decides whether to render this at all (only for
 * the owner) and passes down the state; the button posts to
 * /report/[id]/visibility, the same low-JS form-POST pattern as AuthControls'
 * logout.
 */

export function ReportVisibilityControl({
  reportId,
  isPublic,
  canBeMadePublic,
}: {
  reportId: string;
  isPublic: boolean;
  canBeMadePublic: boolean;
}) {
  if (isPublic) {
    return (
      <p className="mt-2 text-xs font-medium text-slate-500">
        Public — visible to anyone with this link
      </p>
    );
  }

  if (!canBeMadePublic) {
    return (
      <p className="mt-2 text-xs font-medium text-slate-500">
        Private — sourced from a private repository, so it can never be made public
      </p>
    );
  }

  return (
    <form
      action={`/report/${reportId}/visibility`}
      method="post"
      className="mt-2 flex items-center gap-2"
    >
      <span className="text-xs font-medium text-slate-500">Private — only you can see this</span>
      <button
        type="submit"
        className="text-xs font-semibold text-slate-600 underline transition-colors hover:text-slate-900"
      >
        Make public
      </button>
    </form>
  );
}

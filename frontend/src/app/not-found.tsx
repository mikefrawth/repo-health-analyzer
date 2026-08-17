import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        No such Report
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        This Report doesn&apos;t exist, or the link is incomplete. Reports are created
        by analyzing a repository from the homepage.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        Analyze a repository
      </Link>
    </div>
  );
}

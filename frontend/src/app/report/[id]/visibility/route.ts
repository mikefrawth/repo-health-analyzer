/**
 * The owner-only "make this Report public" action, following the same
 * low-JS form-POST pattern as /auth/signout.
 */

import { NextResponse } from "next/server";

import { makeReportPublic } from "@/lib/reports-repo";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const { origin } = new URL(request.url);
  // Errors (not the owner, source repo was private, no such Report) are
  // swallowed into a no-op redirect: the report page re-renders from the
  // database's actual state either way, so there's nothing extra to report.
  await makeReportPublic(params.id);
  // 303: the browser's follow-up request must be a GET, not a repeat POST.
  return NextResponse.redirect(`${origin}/report/${params.id}`, { status: 303 });
}

/**
 * The one write path: validate, analyze, save, hand back a Report id.
 *
 * This route holds both secrets the browser must never see — the backend's
 * shared secret and Supabase's service-role key — which is why analysis and
 * persistence happen here rather than on the client.
 */

import { NextResponse } from "next/server";

import {
  describeAnalyzeFailure,
  httpStatusFor,
  type AnalyzeFailure,
} from "@/lib/analyze-errors";
import { requestAnalysis, type RequesterToken } from "@/lib/backend";
import { INVALID_REPO_URL_MESSAGE, parseRepoUrl } from "@/lib/repo-url";
import { saveReport } from "@/lib/reports-repo";
import { currentUser } from "@/lib/supabase-server";
import { fetchGithubProfile } from "@/lib/user-profiles-repo";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const repoUrl = await readRepoUrl(request);

  // Rejected before spending a backend call, and before any network access.
  if (!parseRepoUrl(repoUrl)) {
    return failure({ code: "invalid_url", message: INVALID_REPO_URL_MESSAGE });
  }

  const user = await currentUser();
  const requesterToken = user ? await requesterTokenFor(user.id) : null;

  let analyzed;
  try {
    analyzed = await requestAnalysis(repoUrl, clientIpFrom(request), requesterToken);
  } catch (error) {
    // `requestAnalysis` answers an unreachable backend with `status: null`
    // rather than throwing, so the only way out here is `requireEnv` — a missing
    // PYTHON_BACKEND_URL or INTERNAL_API_SECRET. That's our deployment being
    // wrong, not the service being down, and the two need different messages:
    // "try again in a moment" is useless advice for an unset variable. 500 is
    // the status that maps to `service_misconfigured`, which is the message we
    // want; no response actually arrived.
    console.error("[analyze] could not call the backend:", error);
    return failure(describeAnalyzeFailure(500));
  }

  if (!analyzed.ok) {
    const analyzeFailure = describeAnalyzeFailure(
      analyzed.status,
      analyzed.detail,
      analyzed.code,
    );
    if (analyzeFailure.code === "service_misconfigured" || analyzeFailure.code === "unknown") {
      // Every other code is a diagnosis the user can act on. These two are ours
      // to fix, and their backend detail is deliberately not shown to the user —
      // so it has to land somewhere the operator will see it.
      console.error(
        `[analyze] backend returned ${analyzed.status}:`,
        analyzed.detail ?? "(no detail)",
      );
    }
    return failure(analyzeFailure);
  }

  try {
    const id = await saveReport(analyzed.data, user?.id ?? null);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("[analyze] analysis succeeded but the Report could not be saved:", error);
    return failure({
      code: "unknown",
      message:
        "We analyzed the repository but couldn't save the Report. Please try again.",
    });
  }
}

/**
 * The visitor's IP as seen by our own edge, for the backend's per-IP rate
 * limit. Vercel (and most proxies) put the original client first in
 * `x-forwarded-for`; nothing upstream of us is trusted to have set this
 * header honestly, but that's fine — worst case a spoofed value only lets
 * that one request dodge its own rate limit, it can't affect anyone else's.
 */
function clientIpFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Issue #24: the signed-in requester's own stored GitHub token, if they have
 * a usable one. A profile row failing to load isn't fatal to analysis —
 * it just means this request falls back to the server's shared token, same
 * as an anonymous one.
 */
async function requesterTokenFor(userId: string): Promise<RequesterToken | null> {
  try {
    const profile = await fetchGithubProfile(userId);
    if (!profile?.github_token || !profile.github_token_scope) {
      return null;
    }
    return { token: profile.github_token, scope: profile.github_token_scope };
  } catch (error) {
    console.error("[analyze] could not load the signed-in user's GitHub profile:", error);
    return null;
  }
}

async function readRepoUrl(request: Request): Promise<string> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "repo_url" in body) {
      const value = (body as { repo_url: unknown }).repo_url;
      return typeof value === "string" ? value : "";
    }
  } catch {
    // A body we can't parse is treated the same as one with no URL in it.
  }
  return "";
}

function failure(error: AnalyzeFailure): NextResponse {
  return NextResponse.json({ error }, { status: httpStatusFor(error.code) });
}

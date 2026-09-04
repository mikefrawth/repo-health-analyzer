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
import type { AnalyzeResponse } from "@/lib/report";
import { INVALID_REPO_URL_MESSAGE, parseRepoUrl } from "@/lib/repo-url";
import { saveReport } from "@/lib/reports-repo";
import { canRequestDetailedReport, creditBalance } from "@/lib/subscription";
import {
  consumeCreditForReport,
  fetchOwnLedgerForPeriod,
  fetchOwnSubscription,
  refundCreditForReport,
  type SubscriptionRow,
} from "@/lib/subscriptions-repo";
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
  const gating = user ? await detailedReportGatingFor() : null;

  let analyzed;
  try {
    analyzed = await requestAnalysis(
      repoUrl,
      clientIpFrom(request),
      requesterToken,
      gating?.wantsDetailed ?? false,
    );
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

  let id: string;
  try {
    id = await saveReport(analyzed.data, user?.id ?? null);
  } catch (error) {
    console.error("[analyze] analysis succeeded but the Report could not be saved:", error);
    return failure({
      code: "unknown",
      message:
        "We analyzed the repository but couldn't save the Report. Please try again.",
    });
  }

  if (gating?.wantsDetailed && user) {
    await settleDetailedReportCredit(user.id, gating.subscription, id, analyzed.data);
  }

  return NextResponse.json({ id }, { status: 201 });
}

/**
 * Issue #25: whether this signed-in user may spend a credit on a detailed
 * Report right now, and the subscription row that decision was based on --
 * carried forward so the eventual ledger write reuses the same period dates
 * rather than re-fetching them.
 */
async function detailedReportGatingFor(): Promise<{
  wantsDetailed: boolean;
  subscription: SubscriptionRow;
} | null> {
  const subscription = await fetchOwnSubscription();
  if (!subscription) {
    return null;
  }
  const ledger = await fetchOwnLedgerForPeriod(subscription.current_period_start);
  const balance = creditBalance(ledger, subscription.current_period_start);
  return {
    wantsDetailed: canRequestDetailedReport(subscription.status, balance),
    subscription,
  };
}

/**
 * Consume the credit the gating decision approved, and refund it if
 * generation was attempted but didn't come back with a summary. Ledger
 * writes are best-effort here -- the Report itself is already saved, and a
 * ledger hiccup shouldn't turn a successful analysis into a user-facing
 * error; it's logged for an operator to reconcile instead.
 */
async function settleDetailedReportCredit(
  userId: string,
  subscription: SubscriptionRow,
  reportId: string,
  analyzed: AnalyzeResponse,
): Promise<void> {
  if (!analyzed.ai_summary_attempted) {
    // Never tried (e.g. the Target Repository turned out private) -- no
    // credit was ever at stake.
    return;
  }
  const row = {
    user_id: userId,
    billing_period_start: subscription.current_period_start,
    billing_period_end: subscription.current_period_end,
    report_id: reportId,
  };
  try {
    await consumeCreditForReport(row);
    if (analyzed.ai_summary === null) {
      await refundCreditForReport(row);
    }
  } catch (error) {
    console.error("[analyze] could not settle the credit ledger for this Report:", error);
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

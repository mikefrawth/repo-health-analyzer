/**
 * Calling the FastAPI analyzer backend.
 *
 * The backend is gated by a shared secret (see ADR-0002 / the `/analyze`
 * dependency in backend/app/main.py): this route is the only thing that holds
 * it, which is what stops anyone who finds the backend's URL from spending our
 * Claude budget.
 */

import { requireEnv } from "./env";
import type { AnalyzeResponse } from "./report";

export type BackendResult =
  | { ok: true; data: AnalyzeResponse }
  /** `status: null` means no response arrived — the backend was unreachable. */
  | { ok: false; status: number | null; detail: string | null; code: string | null };

/**
 * A clone plus a Claude call is not a fast request, and cutting it off early
 * would throw away work already done. Generous, but bounded.
 */
const ANALYZE_TIMEOUT_MS = 180_000;

/** Issue #24: the signed-in requester's own GitHub token, when there is one. */
export type RequesterToken = {
  token: string;
  scope: "public" | "repo";
};

export async function requestAnalysis(
  repoUrl: string,
  clientIp: string,
  requesterToken?: RequesterToken | null,
  // Issue #25: the caller's own credit-gating decision -- whether this
  // request may spend a credit generating the AI Summary. Defaults to false
  // so an anonymous/free-tier caller that doesn't pass it explicitly gets
  // the free (no AI Summary) Report, never an unintended paid one.
  generateAiSummary = false,
): Promise<BackendResult> {
  const backendUrl = requireEnv("PYTHON_BACKEND_URL").replace(/\/+$/, "");
  const secret = requireEnv("INTERNAL_API_SECRET");

  let response: Response;
  try {
    response = await fetch(`${backendUrl}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
        // The backend is only ever called from here, never straight from a
        // browser, so its own request.client is always this server's IP —
        // it needs the visitor's IP handed to it explicitly to rate-limit
        // per visitor rather than per (shared) Next.js egress IP.
        "X-Client-Ip": clientIp,
      },
      body: JSON.stringify({
        repo_url: repoUrl,
        github_token: requesterToken?.token ?? null,
        github_token_scope: requesterToken?.scope ?? null,
        generate_ai_summary: generateAiSummary,
      }),
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Connection refused, DNS failure, or our own timeout: we never got a status.
    return { ok: false, status: null, detail: null, code: null };
  }

  if (!response.ok) {
    const { detail, code } = await readFailureBody(response);
    return { ok: false, status: response.status, detail, code };
  }

  try {
    return { ok: true, data: (await response.json()) as AnalyzeResponse };
  } catch {
    // A 200 we can't parse is an upstream failure, not a successful analysis.
    return { ok: false, status: 502, detail: null, code: null };
  }
}

/** The backend renders its failures as `{"detail": "...", "code"?: "..."}`. */
async function readFailureBody(
  response: Response,
): Promise<{ detail: string | null; code: string | null }> {
  try {
    const body = (await response.json()) as { detail?: unknown; code?: unknown };
    return {
      detail: typeof body.detail === "string" ? body.detail : null,
      code: typeof body.code === "string" ? body.code : null,
    };
  } catch {
    return { detail: null, code: null };
  }
}

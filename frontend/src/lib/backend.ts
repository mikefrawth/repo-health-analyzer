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
  | { ok: false; status: number | null; detail: string | null };

/**
 * A clone plus a Claude call is not a fast request, and cutting it off early
 * would throw away work already done. Generous, but bounded.
 */
const ANALYZE_TIMEOUT_MS = 180_000;

export async function requestAnalysis(
  repoUrl: string,
  clientIp: string,
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
      body: JSON.stringify({ repo_url: repoUrl }),
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Connection refused, DNS failure, or our own timeout: we never got a status.
    return { ok: false, status: null, detail: null };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, detail: await readDetail(response) };
  }

  try {
    return { ok: true, data: (await response.json()) as AnalyzeResponse };
  } catch {
    // A 200 we can't parse is an upstream failure, not a successful analysis.
    return { ok: false, status: 502, detail: null };
  }
}

/** The backend renders its failures as `{"detail": "..."}`. */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : null;
  } catch {
    return null;
  }
}

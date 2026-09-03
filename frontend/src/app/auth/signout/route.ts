import { NextResponse } from "next/server";

import { serverClient } from "@/lib/supabase-server";

export async function POST(request: Request): Promise<NextResponse> {
  const { origin } = new URL(request.url);
  await serverClient().auth.signOut();
  // 303: the browser's follow-up request must be a GET, not a repeat POST.
  return NextResponse.redirect(origin, { status: 303 });
}

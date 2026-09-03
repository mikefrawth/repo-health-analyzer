/**
 * Proves migration 0005's RLS policy and check constraint hold against a
 * real Postgres — the guarantees this repo cares most about (a private
 * Report is invisible to everyone but its owner; a private-repo-sourced
 * Report can never be flipped public) live in the database, not in
 * application code, so only a real database can prove them.
 *
 * Requires a local Supabase stack (`supabase start`, run from `frontend/`)
 * with migrations applied, and SUPABASE_URL/SUPABASE_ANON_KEY/
 * SUPABASE_SERVICE_ROLE_KEY pointed at it — see the `db` job in
 * .github/workflows/ci.yml. Not part of `npm test`; run with
 * `npm run test:integration`.
 */

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. This suite needs a local Supabase stack — see the file header.`,
    );
  }
  return value;
}

const URL = env("SUPABASE_URL");
const ANON_KEY = env("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(URL, SERVICE_ROLE_KEY);

/** A client authenticated as `userId`, for exercising RLS as that user. */
async function clientForUser(email: string, password: string): Promise<SupabaseClient> {
  const anon = createClient(URL, ANON_KEY);
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Could not sign in as ${email}: ${error?.message}`);
  }
  return createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

async function createTestUser(): Promise<{ id: string; email: string; password: string }> {
  const email = `${randomUUID()}@example.test`;
  const password = "correct-horse-battery-staple";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Could not create test user: ${error?.message}`);
  }
  return { id: data.user.id, email, password };
}

/** Insert a Report row directly, bypassing RLS, so each test starts from a known state. */
async function insertReport(row: {
  owner_id: string | null;
  is_public: boolean;
  source_repo_was_private: boolean;
}): Promise<string> {
  const { data, error } = await admin
    .from("reports")
    .insert({
      repo_url: "https://github.com/owner/repo",
      metrics: {},
      health_score: 50,
      analysis_scope: {},
      component_scores: {},
      component_weights: {},
      ai_summary: null,
      ...row,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Could not insert test Report: ${error?.message}`);
  }
  return data.id as string;
}

describe("Report visibility (issue #22)", () => {
  let owner: { id: string; email: string; password: string };
  let other: { id: string; email: string; password: string };
  let ownerClient: SupabaseClient;
  let otherClient: SupabaseClient;
  let anonClient: SupabaseClient;
  const reportIds: string[] = [];

  beforeAll(async () => {
    owner = await createTestUser();
    other = await createTestUser();
    ownerClient = await clientForUser(owner.email, owner.password);
    otherClient = await clientForUser(other.email, other.password);
    anonClient = createClient(URL, ANON_KEY);
  });

  afterAll(async () => {
    if (reportIds.length > 0) {
      await admin.from("reports").delete().in("id", reportIds);
    }
    await admin.auth.admin.deleteUser(owner.id);
    await admin.auth.admin.deleteUser(other.id);
  });

  async function trackedInsert(row: {
    owner_id: string | null;
    is_public: boolean;
    source_repo_was_private: boolean;
  }): Promise<string> {
    const id = await insertReport(row);
    reportIds.push(id);
    return id;
  }

  it("is invisible to a non-owner and to anonymous while private", async () => {
    const id = await trackedInsert({
      owner_id: owner.id,
      is_public: false,
      source_repo_was_private: false,
    });

    const { data: ownerRead } = await ownerClient.from("reports").select("id").eq("id", id);
    const { data: otherRead } = await otherClient.from("reports").select("id").eq("id", id);
    const { data: anonRead } = await anonClient.from("reports").select("id").eq("id", id);

    expect(ownerRead).toHaveLength(1);
    expect(otherRead).toHaveLength(0);
    expect(anonRead).toHaveLength(0);
  });

  it("is readable by anyone once public", async () => {
    const id = await trackedInsert({
      owner_id: owner.id,
      is_public: true,
      source_repo_was_private: false,
    });

    const { data: otherRead } = await otherClient.from("reports").select("id").eq("id", id);
    const { data: anonRead } = await anonClient.from("reports").select("id").eq("id", id);

    expect(otherRead).toHaveLength(1);
    expect(anonRead).toHaveLength(1);
  });

  it("keeps an anonymous, unowned Report public with no owner", async () => {
    const id = await trackedInsert({
      owner_id: null,
      is_public: true,
      source_repo_was_private: false,
    });

    const { data: anonRead } = await anonClient.from("reports").select("id").eq("id", id);
    expect(anonRead).toHaveLength(1);
  });

  it("lets the owner flip their own Report to public", async () => {
    const id = await trackedInsert({
      owner_id: owner.id,
      is_public: false,
      source_repo_was_private: false,
    });

    const { data, error } = await ownerClient
      .from("reports")
      .update({ is_public: true })
      .eq("id", id)
      .select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const { data: anonRead } = await anonClient.from("reports").select("id").eq("id", id);
    expect(anonRead).toHaveLength(1);
  });

  it("rejects a non-owner's attempt to flip someone else's Report public", async () => {
    const id = await trackedInsert({
      owner_id: owner.id,
      is_public: false,
      source_repo_was_private: false,
    });

    const { data } = await otherClient
      .from("reports")
      .update({ is_public: true })
      .eq("id", id)
      .select("id");

    // RLS's USING clause matches zero rows for a non-owner — no error, no update.
    expect(data).toHaveLength(0);

    const { data: check } = await admin.from("reports").select("is_public").eq("id", id).single();
    expect(check?.is_public).toBe(false);
  });

  it("rejects making a private-repo-sourced Report public, even as its owner", async () => {
    const id = await trackedInsert({
      owner_id: owner.id,
      is_public: false,
      source_repo_was_private: true,
    });

    const { error } = await ownerClient
      .from("reports")
      .update({ is_public: true })
      .eq("id", id)
      .select("id");

    // The check constraint raises rather than silently matching zero rows —
    // this is the database refusing the write outright, not RLS filtering it.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");

    const { data: check } = await admin.from("reports").select("is_public").eq("id", id).single();
    expect(check?.is_public).toBe(false);
  });

  it("refuses to even insert a public Report already flagged as private-sourced", async () => {
    const { error } = await admin.from("reports").insert({
      repo_url: "https://github.com/owner/repo",
      metrics: {},
      health_score: 50,
      analysis_scope: {},
      component_scores: {},
      component_weights: {},
      ai_summary: null,
      owner_id: owner.id,
      is_public: true,
      source_repo_was_private: true,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });
});

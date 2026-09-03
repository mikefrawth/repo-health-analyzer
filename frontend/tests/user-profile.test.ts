import { describe, expect, it } from "vitest";

import { githubProfileRow, githubUsername } from "@/lib/user-profile";
import type { AuthUser } from "@/lib/user-profile";

function makeUser(userMetadata: Record<string, unknown>): AuthUser {
  return { id: "11111111-1111-1111-1111-111111111111", user_metadata: userMetadata };
}

describe("githubUsername", () => {
  it("reads user_name, which is what Supabase's GitHub provider populates", () => {
    expect(githubUsername(makeUser({ user_name: "octocat" }))).toBe("octocat");
  });

  it("falls back to preferred_username when user_name is absent", () => {
    expect(githubUsername(makeUser({ preferred_username: "octocat" }))).toBe("octocat");
  });

  it("prefers user_name over preferred_username when both are present", () => {
    expect(githubUsername(makeUser({ user_name: "octocat", preferred_username: "other" }))).toBe(
      "octocat",
    );
  });

  it("returns null when neither field is present", () => {
    expect(githubUsername(makeUser({}))).toBeNull();
  });

  it("returns null rather than a non-string value", () => {
    expect(githubUsername(makeUser({ user_name: 42 }))).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(githubUsername(makeUser({ user_name: "" }))).toBeNull();
  });
});

describe("githubProfileRow", () => {
  it("carries the user id, username, and provider token through unchanged", () => {
    const user = makeUser({ user_name: "octocat" });
    expect(githubProfileRow(user, "gho_abc123")).toEqual({
      id: user.id,
      github_username: "octocat",
      github_token: "gho_abc123",
      // No scope was requested at sign-in (ticket #20 asks for GitHub's
      // default scope only) — labelled explicitly so a later ticket that
      // requests the private-repo scope has a value to widen.
      github_token_scope: "public",
    });
  });

  it("stores a null token and scope when the provider token is absent", () => {
    // Can happen if Supabase's exchange succeeds but GitHub's response omits
    // the provider token — treated as no usable token rather than an error.
    const user = makeUser({ user_name: "octocat" });
    expect(githubProfileRow(user, null)).toEqual({
      id: user.id,
      github_username: "octocat",
      github_token: null,
      github_token_scope: null,
    });
  });

  it("labels the token with the private-repo scope when that's what was requested", () => {
    // Issue #24's progressive-consent step: a later OAuth round trip can ask
    // for more than ticket #20's default.
    const user = makeUser({ user_name: "octocat" });
    expect(githubProfileRow(user, "gho_abc123", "repo")).toEqual({
      id: user.id,
      github_username: "octocat",
      github_token: "gho_abc123",
      github_token_scope: "repo",
    });
  });

  it("stores a null scope even for a widened request when there's no token to label", () => {
    const user = makeUser({ user_name: "octocat" });
    expect(githubProfileRow(user, null, "repo")).toEqual({
      id: user.id,
      github_username: "octocat",
      github_token: null,
      github_token_scope: null,
    });
  });
});

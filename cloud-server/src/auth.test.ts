import { describe, expect, test } from "vitest";
import { checkBasicAuthHeader, checkQueryToken, parseUsers } from "./auth.ts";

function basicHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

describe("parseUsers", () => {
  test("parses a comma-separated user:pass list", () => {
    const users = parseUsers("alice:s3cret,bob:t0p");
    expect(users.get("alice")).toBe("s3cret");
    expect(users.get("bob")).toBe("t0p");
    expect(users.size).toBe(2);
  });

  test("throws a clear error when unset (server must not run with no auth configured)", () => {
    expect(() => parseUsers(undefined)).toThrow(/CHESSNOTE_CLOUD_USERS/);
    expect(() => parseUsers("")).toThrow(/CHESSNOTE_CLOUD_USERS/);
  });

  test("throws on a malformed entry (missing colon)", () => {
    expect(() => parseUsers("alice-no-colon")).toThrow(/sai định dạng/);
  });

  test("throws on an entry with an empty username or password", () => {
    expect(() => parseUsers(":pass")).toThrow();
    expect(() => parseUsers("user:")).toThrow();
  });

  test("password may itself contain a colon (only the FIRST colon splits)", () => {
    const users = parseUsers("alice:pass:with:colons");
    expect(users.get("alice")).toBe("pass:with:colons");
  });
});

describe("checkBasicAuthHeader", () => {
  const users = parseUsers("alice:s3cret");

  test("returns the username on a correct Basic Auth header", () => {
    expect(checkBasicAuthHeader(basicHeader("alice", "s3cret"), users)).toBe("alice");
  });

  test("returns undefined on a wrong password", () => {
    expect(checkBasicAuthHeader(basicHeader("alice", "wrong"), users)).toBeUndefined();
  });

  test("returns undefined for an unknown username", () => {
    expect(checkBasicAuthHeader(basicHeader("mallory", "s3cret"), users)).toBeUndefined();
  });

  test("returns undefined when the header is missing or not Basic", () => {
    expect(checkBasicAuthHeader(undefined, users)).toBeUndefined();
    expect(checkBasicAuthHeader("Bearer sometoken", users)).toBeUndefined();
  });

  test("returns undefined on garbage base64", () => {
    expect(checkBasicAuthHeader("Basic %%%not-base64%%%", users)).toBeUndefined();
  });
});

describe("checkQueryToken", () => {
  const users = parseUsers("alice:s3cret");

  test("returns the username for the same base64(user:pass) token used in Basic Auth", () => {
    const token = Buffer.from("alice:s3cret").toString("base64");
    expect(checkQueryToken(token, users)).toBe("alice");
  });

  test("returns undefined for a wrong password", () => {
    const token = Buffer.from("alice:wrong").toString("base64");
    expect(checkQueryToken(token, users)).toBeUndefined();
  });

  test("returns undefined for a missing token", () => {
    expect(checkQueryToken(null, users)).toBeUndefined();
    expect(checkQueryToken(undefined, users)).toBeUndefined();
  });
});

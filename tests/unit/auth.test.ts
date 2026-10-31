import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.AMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), "aman-test-"));

const { useMemoryDb } = await import("@/server/db");
const { createSession, OPERATORS, resolveOperator } = await import("@/server/auth");

beforeAll(() => useMemoryDb());
afterEach(() => {
  delete process.env.AMAN_REQUIRE_LOGIN;
});

describe("operator access", () => {
  it("opens as the duty officer in demo mode (no sign-in)", () => {
    expect(resolveOperator(undefined)?.id).toBe("OP-ALYA");
    expect(resolveOperator("forged.token")?.id).toBe("OP-ALYA");
  });

  it("keeps a signed-in operator's identity and role", () => {
    const sami = OPERATORS.find((o) => o.id === "OP-SAMI")!;
    expect(resolveOperator(createSession(sami))?.role).toBe("analyst");
  });

  it("requires a valid session when AMAN_REQUIRE_LOGIN is set", () => {
    process.env.AMAN_REQUIRE_LOGIN = "1";
    expect(resolveOperator(undefined)).toBeNull();
    expect(resolveOperator("forged.token")).toBeNull();
    expect(resolveOperator(createSession(OPERATORS[0]))?.id).toBe("OP-ALYA");
  });
});

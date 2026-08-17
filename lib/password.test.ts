import { describe, expect, it } from "vitest";
import { hashPassword, normalizeEmail, verifyPassword } from "./password";

describe("password hashing", () => {
  it("accepts the original password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("normalises email addresses", () => {
    expect(normalizeEmail(" Owner@Example.COM ")).toBe("owner@example.com");
  });
});

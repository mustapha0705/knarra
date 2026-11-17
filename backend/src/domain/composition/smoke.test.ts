import { describe, expect, it } from "vitest";
import { z } from "zod";

// Proves the toolchain: TypeScript is transformed, Vitest runs, and Zod
// resolves. Real kernel schemas arrive in KNAR-102.
describe("backend TypeScript toolchain", () => {
  const schema = z.strictObject({ durationMs: z.number().int().nonnegative() });

  it("parses a valid value with Zod", () => {
    expect(schema.parse({ durationMs: 3000 })).toEqual({ durationMs: 3000 });
  });

  it("rejects an invalid value with an issue at the expected path", () => {
    const result = schema.safeParse({ durationMs: -1 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["durationMs"]);
  });
});

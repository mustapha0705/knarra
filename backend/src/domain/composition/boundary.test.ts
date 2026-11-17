import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Enforces the architectural rule that the Composition kernel and the render
// compiler are pure: no Express, no file system, no processes, no database.
// (This test file itself may use Node; the rule covers non-test sources.)

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => join(directory, entry.name));
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]!);
}

describe("purity boundaries", () => {
  it("the Composition kernel imports only zod and its own modules", () => {
    const files = sourceFiles(join(src, "domain/composition"));
    expect(files.length).toBeGreaterThan(5);

    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(/^(zod|\.\/[a-z]+\.js)$/);
      }
    }
  });

  it("the render compiler imports only the kernel and its own modules", () => {
    const files = sourceFiles(join(src, "render/compiler"));
    expect(files.length).toBeGreaterThan(1);

    for (const file of files) {
      for (const specifier of importsOf(file)) {
        expect(specifier, `${file} imports ${specifier}`).toMatch(
          /^(\.\/[a-z]+\.js|\.\.\/\.\.\/domain\/composition\/index\.js)$/,
        );
      }
    }
  });

  it("neither uses Node globals for I/O", () => {
    const files = [...sourceFiles(join(src, "domain/composition")), ...sourceFiles(join(src, "render/compiler"))];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\b(process\.|require\(|Buffer\.|__dirname|fetch\()/);
    }
  });
});

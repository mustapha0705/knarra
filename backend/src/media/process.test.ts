import { describe, expect, it } from "vitest";
import { ProcessError, runProcess } from "./process.js";

// These tests run the current Node binary as the child process, so they need
// nothing installed beyond Node itself.
const node = process.execPath;
const script = (code: string) => ["-e", code];

async function failure(promise: Promise<unknown>): Promise<ProcessError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProcessError) return error;
    throw error;
  }
  throw new Error("expected the process to fail");
}

describe("runProcess", () => {
  it("resolves when the process exits with code 0", async () => {
    await expect(runProcess(node, script("process.exit(0)"))).resolves.toEqual({ stdout: "", stderr: "" });
  });

  it("collects stdout only when asked", async () => {
    const code = "process.stdout.write('hello')";

    expect((await runProcess(node, script(code))).stdout).toBe("");
    expect((await runProcess(node, script(code), { collectStdout: true })).stdout).toBe("hello");
  });

  it("delivers complete stdout lines, including a final line without a newline", async () => {
    const lines: string[] = [];

    await runProcess(node, script("process.stdout.write('a=1\\r\\nb=2\\nlast')"), {
      onStdoutLine: (line) => lines.push(line),
    });

    expect(lines).toEqual(["a=1", "b=2", "last"]);
  });

  it("passes arguments verbatim, with no shell interpretation", async () => {
    const tricky = ["a b", "$HOME", "`id`", "x;y", "&&", "|", '"q"', "*", "%PATH%", ">out.txt"];

    const { stdout } = await runProcess(
      node,
      ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", "--", ...tricky],
      { collectStdout: true },
    );

    expect(JSON.parse(stdout)).toEqual(tricky);
  });

  it("rejects with the exit code and stderr when the process fails", async () => {
    const error = await failure(runProcess(node, script("console.error('boom'); process.exit(3)")));

    expect(error).toMatchObject({ failure: "exit", exitCode: 3 });
    expect(error.stderr).toContain("boom");
  });

  it("keeps only the end of a long stderr", async () => {
    const error = await failure(
      runProcess(node, script("process.stderr.write('x'.repeat(5000) + 'THE-END'); process.exit(1)"), {
        maxStderrBytes: 100,
      }),
    );

    expect(error.stderr).toHaveLength(100);
    expect(error.stderr.endsWith("THE-END")).toBe(true);
  });

  it("rejects when the program does not exist", async () => {
    const error = await failure(runProcess("knarra-no-such-program", []));

    expect(error.failure).toBe("start");
  });

  it("kills the process and rejects when aborted", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const running = runProcess(node, script("setTimeout(() => {}, 60000)"), { signal: controller.signal });
    setTimeout(() => controller.abort(), 200);

    const error = await failure(running);

    expect(error.failure).toBe("aborted");
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("does not start the process when already aborted", async () => {
    const error = await failure(
      runProcess(node, script("require('fs').writeFileSync('should-not-exist.txt', '')"), {
        signal: AbortSignal.abort(),
      }),
    );

    expect(error.failure).toBe("aborted");
  });

  it("kills the process and rejects on timeout", async () => {
    const error = await failure(runProcess(node, script("setTimeout(() => {}, 60000)"), { timeoutMs: 200 }));

    expect(error.failure).toBe("timeout");
  });

  it("kills a process that produces more stdout than allowed", async () => {
    const error = await failure(
      runProcess(node, script("setInterval(() => process.stdout.write('x'.repeat(1000)), 1)"), {
        collectStdout: true,
        maxStdoutBytes: 5000,
      }),
    );

    expect(error.failure).toBe("output-too-large");
  });
});

import { spawn } from "node:child_process";

export type ProcessFailure = "start" | "exit" | "aborted" | "timeout" | "output-too-large";

/**
 * A child process that did not finish successfully. `stderr` is bounded and is
 * for server logs only: it can contain file paths and must not be sent to a
 * client.
 */
export class ProcessError extends Error {
  readonly failure: ProcessFailure;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(failure: ProcessFailure, message: string, exitCode: number | null = null, stderr = "") {
    super(message);
    this.name = "ProcessError";
    this.failure = failure;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export interface RunProcessOptions {
  /** Aborting kills the process; the promise then rejects with failure "aborted". */
  signal?: AbortSignal;
  /** Kills the process after this long; rejects with failure "timeout". */
  timeoutMs?: number;
  /** Called for each complete stdout line, without its line ending. */
  onStdoutLine?: (line: string) => void;
  /** Collect stdout and return it. Off by default, so long outputs are not buffered. */
  collectStdout?: boolean;
  /** Upper bound for collected stdout. Exceeding it kills the process. */
  maxStdoutBytes?: number;
  /** How much of the end of stderr to keep for diagnostics. */
  maxStderrBytes?: number;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_MAX_STDOUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 16 * 1024;

/**
 * Runs a program with an argument array and no shell (ADR 0002). Arguments are
 * passed to the program exactly as given, so spaces, quotes, and shell
 * metacharacters in them have no special meaning.
 *
 * Resolves when the process exits with code 0. Rejects with a ProcessError
 * otherwise, always after the process has fully closed, so its files are no
 * longer in use when the caller cleans up.
 */
export function runProcess(
  command: string,
  args: readonly string[],
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  const {
    signal,
    timeoutMs,
    onStdoutLine,
    collectStdout = false,
    maxStdoutBytes = DEFAULT_MAX_STDOUT_BYTES,
    maxStderrBytes = DEFAULT_MAX_STDERR_BYTES,
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProcessError("aborted", `${command} was cancelled before it started`));
      return;
    }

    let child;
    try {
      child = spawn(command, [...args], {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // spawn throws synchronously for some failures, such as ENAMETOOLONG.
      const reason = error instanceof Error ? error.message : String(error);
      reject(new ProcessError("start", `Could not start ${command}: ${reason}`));
      return;
    }

    let stopReason: ProcessFailure | null = null;
    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";
    let pendingLine = "";
    let settled = false;

    const stop = (reason: ProcessFailure) => {
      if (stopReason) return;
      stopReason = reason;
      child.kill();
    };

    const onAbort = () => stop("aborted");
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => stop("timeout"), timeoutMs);

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      if (timer) clearTimeout(timer);
      action();
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (collectStdout) {
        stdoutBytes += Buffer.byteLength(chunk);
        if (stdoutBytes > maxStdoutBytes) {
          stop("output-too-large");
          return;
        }
        stdout += chunk;
      }
      if (onStdoutLine) {
        const lines = (pendingLine + chunk).split("\n");
        pendingLine = lines.pop() ?? "";
        for (const line of lines) onStdoutLine(line.replace(/\r$/, ""));
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-maxStderrBytes);
    });

    child.on("error", (error) => {
      finish(() => reject(new ProcessError("start", `Could not start ${command}: ${error.message}`)));
    });

    child.on("close", (code) => {
      finish(() => {
        if (onStdoutLine && pendingLine.length > 0) onStdoutLine(pendingLine.replace(/\r$/, ""));

        if (stopReason === "aborted") {
          reject(new ProcessError("aborted", `${command} was cancelled`, code, stderr));
        } else if (stopReason === "timeout") {
          reject(new ProcessError("timeout", `${command} did not finish within ${timeoutMs} ms`, code, stderr));
        } else if (stopReason === "output-too-large") {
          reject(new ProcessError("output-too-large", `${command} produced more output than allowed`, code, stderr));
        } else if (code !== 0) {
          reject(new ProcessError("exit", `${command} exited with code ${code}`, code, stderr));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  });
}

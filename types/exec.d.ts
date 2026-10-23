/** `$dsh/exec` — one command in the workspace, under the session's own sandbox mode. */
declare module "$dsh/exec" {
  /** What a command left behind. `truncated` means output was cut, not that it failed. */
  export type ExecResult = { stdout: string; stderr: string; exitCode: number | null; truncated: { stdout: boolean; stderr: boolean }; timedOut: boolean };
  /**
   * Runs `command` and resolves with its output.
   *
   * A non-zero exit RESOLVES — check `exitCode` rather than catching. Only a failure to run
   * at all rejects. Commands are killed after 15,000 ms by default. Pass `timeoutMs` to
   * request a positive integer budget up to 300,000 ms (5 minutes), subject to a lower
   * executor limit configured by the host. A request above either limit rejects before
   * execution with `code: "EXEC_TIMEOUT_EXCEEDED"` and `denied: true`; it is never silently
   * shortened. Other invalid values reject with `code: "EXEC_INVALID_TIMEOUT"` and
   * `denied: false`. Omitting `timeoutMs` preserves the default budget.
   * A command that reaches its deadline still resolves: check `timedOut` before treating
   * empty stdout as an empty result.
   *
   * Pass a `signal` when the card runs commands on a timer or per keystroke: aborting kills
   * the command itself, not just the wait, so a slow run cannot pile up behind the next one.
   * An aborted call REJECTS with an `AbortError` — the one rejection that is not a failure,
   * so ignore it rather than showing it (`if (e.name === "AbortError") return`).
   */
  export function bash(command: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<ExecResult>;
}

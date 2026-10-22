/** `$dsh/exec` — one command in the workspace, under the session's own sandbox mode. */
declare module "$dsh/exec" {
  /** What a command left behind. `truncated` means output was cut, not that it failed. */
  export type ExecResult = { stdout: string; stderr: string; exitCode: number | null; truncated: { stdout: boolean; stderr: boolean }; timedOut: boolean };
  /**
   * A route rejection carries a stable `code` and `denied`, independent of its message.
   * `EXEC_WORKSPACE_DENIED` and `EXEC_SESSION_INVALID` are ownership refusals (`denied: true`).
   * Request errors use `EXEC_WORKSPACE_REQUIRED`, `EXEC_METHOD_NOT_ALLOWED`,
   * `EXEC_BODY_TOO_LARGE`, `EXEC_INVALID_JSON` or `EXEC_INVALID_COMMAND`.
   * Execution failures preserve the host's code, or use `EXEC_FAILED` when it has none.
   * The code set is open; network errors or an older host may have no code.
   */
  export type ExecError = Error & { code?: string; denied?: boolean };
  /**
   * Runs `command` and resolves with its output.
   *
   * A non-zero exit RESOLVES — check `exitCode` rather than catching. Only a failure to run
   * at all rejects. Commands are killed after 15 seconds.
   *
   * Pass a `signal` when the card runs commands on a timer or per keystroke: aborting kills
   * the command itself, not just the wait, so a slow run cannot pile up behind the next one.
   * An aborted call REJECTS with an `AbortError` — the one rejection that is not a failure,
   * so ignore it rather than showing it (`if (e.name === "AbortError") return`).
   */
  export function bash(command: string, options?: { signal?: AbortSignal }): Promise<ExecResult>;
}

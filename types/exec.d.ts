/** `$dsh/exec` — one command in the workspace, under the session's own sandbox mode. */
declare module "$dsh/exec" {
  /** What a command left behind. `truncated` means output was cut, not that it failed. */
  export type ExecResult = { stdout: string; stderr: string; exitCode: number | null; truncated: { stdout: boolean; stderr: boolean }; timedOut: boolean };
  /**
   * Runs `command` and resolves with its output.
   *
   * A non-zero exit RESOLVES — check `exitCode` rather than catching. Only a failure to run
   * at all rejects. Commands are killed after 15 seconds.
   *
   * Pass a `signal` when the card runs commands on a timer or per keystroke: aborting kills
   * the command itself, not just the wait, so a slow run cannot pile up behind the next one.
   * An aborted call REJECTS with `aborted: true`, including a custom `signal.reason` or an
   * abort while reading the response. This is cancellation, not a command failure:
   * `if (isAbortError(error)) return`. A command that already resolved stays resolved.
   */
  export function bash(command: string, options?: { signal?: AbortSignal }): Promise<ExecResult>;
  /**
   * True for a cancelled `bash()` call, including through `new Error(message, { cause })`.
   * Follows `cause` safely even if a wrapper creates a cycle. Checks the `aborted` field,
   * never an error's name or message; returns false for an ordinary execution failure.
   * A wrapper must preserve its cause — discarded error information cannot be recovered.
   */
  export function isAbortError(error: unknown): boolean;
}

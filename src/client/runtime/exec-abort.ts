/** Recognizes a cancelled command, including a caller's `new Error(message, { cause })`. */
export function isAbortError(error: unknown): boolean {
  const seen = new Set<object>();
  while (typeof error === "object" && error !== null && !seen.has(error)) {
    seen.add(error);
    try {
      if ("aborted" in error && error.aborted === true) return true;
      error = "cause" in error ? error.cause : undefined;
    } catch {
      // A getter or proxy in an unrelated thrown value must not make the classifier throw.
      return false;
    }
  }
  return false;
}

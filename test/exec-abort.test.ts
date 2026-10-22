import { restoreGlobals } from "./globals.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { bind, bindingImports, registerUi4aHost, releaseBindings } from "../src/client/runtime/bindings.ts";

let release: () => void;
beforeEach(() => {
  release = registerUi4aHost({ cwd: () => "/w", sessionId: () => "s1", send() {} });
});
afterEach(() => {
  release();
  restoreGlobals();
  releaseBindings();
});

const completed = { stdout: "out", stderr: "", exitCode: 0, truncated: { stdout: false, stderr: false }, timedOut: false };

test("the card's module exports the cancellation classifier", async () => {
  const source = await (await fetch(bindingImports("s1")["$dsh/exec"])).text();
  expect(source).toContain("export const isAbortError = g.isAbortError;");
});

test("a pre-aborted command never starts a fetch", async () => {
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    return Response.json(completed);
  }) as typeof fetch;
  const reason = new Error("superseded");
  const controller = new AbortController();
  controller.abort(reason);
  const { bash, isAbortError } = bind().exec;
  const error = await bash("ls", { signal: controller.signal }).catch((e: unknown) => e);
  expect(fetched).toBe(false);
  expect(error).toMatchObject({ aborted: true, cause: reason });
  expect(isAbortError(error)).toBe(true);
});

for (const reason of [undefined, new Error("another query"), "superseded", 42]) {
  test(`an in-flight abort is recognizable with reason ${String(reason)}`, async () => {
    const controller = new AbortController();
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as typeof fetch;
    const { bash, isAbortError } = bind().exec;
    const pending = bash("ls", { signal: controller.signal });
    controller.abort(reason);
    const error = await pending.catch((e: unknown) => e);
    expect(error).toMatchObject({ aborted: true, cause: controller.signal.reason });
    expect(isAbortError(error)).toBe(true);
    // A retry/refresh helper may add context without knowing this capability's error shape.
    const wrapped = new Error("refresh failed", { cause: new Error("retry failed", { cause: error }) });
    expect(isAbortError(wrapped)).toBe(true);
    const shown: string[] = [];
    if (!isAbortError(wrapped)) shown.push(String(wrapped));
    expect(shown).toEqual([]);
  });
}

test("an abort during a successful response body never resolves as empty output", async () => {
  const controller = new AbortController();
  let reading!: () => void;
  const started = new Promise<void>((resolve) => {
    reading = resolve;
  });
  globalThis.fetch = (async () => ({
    ok: true,
    json: () =>
      new Promise((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
        reading();
      }),
  })) as typeof fetch;
  const { bash, isAbortError } = bind().exec;
  const pending = bash("ls", { signal: controller.signal });
  await started;
  controller.abort(new Error("next poll"));
  let resolved = false;
  const error = await pending.then(
    () => {
      resolved = true;
    },
    (e: unknown) => e,
  );
  expect(resolved).toBe(false);
  expect(isAbortError(error)).toBe(true);
});

test("an aborted fetch shim returning a result still cannot publish stale output", async () => {
  const controller = new AbortController();
  globalThis.fetch = (async () => {
    controller.abort("superseded");
    return Response.json(completed);
  }) as typeof fetch;
  const { bash, isAbortError } = bind().exec;
  const error = await bash("ls", { signal: controller.signal }).catch((e: unknown) => e);
  expect(isAbortError(error)).toBe(true);
  expect(error).not.toHaveProperty("stdout");
});

test("aborting after normal completion does not turn the result into a cancellation", async () => {
  globalThis.fetch = (async () => Response.json(completed)) as typeof fetch;
  const controller = new AbortController();
  const { bash, isAbortError } = bind().exec;
  const pending = bash("ls", { signal: controller.signal });
  const result = await pending;
  controller.abort();
  expect(await pending).toBe(result);
  expect(result).toEqual(completed);
  expect(isAbortError(result)).toBe(false);
});

test("an unrelated rejection stays a failure even if its name looks like cancellation", async () => {
  const failed = Object.assign(new Error("network unavailable"), { name: "AbortError" });
  globalThis.fetch = (async () => {
    throw failed;
  }) as typeof fetch;
  const { bash, isAbortError } = bind().exec;
  const error = await bash("ls", { signal: new AbortController().signal }).catch((e: unknown) => e);
  expect(error).toBe(failed);
  expect(isAbortError(error)).toBe(false);
});

test("an unreadable 200 is a failure, not an untyped successful result", async () => {
  globalThis.fetch = (async () => new Response("not json")) as typeof fetch;
  const { bash, isAbortError } = bind().exec;
  const error = await bash("ls").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SyntaxError);
  expect(isAbortError(error)).toBe(false);
});

test("failed HTTP responses without JSON retain their status fallback", async () => {
  globalThis.fetch = (async () => new Response("<html>", { status: 502, statusText: "Bad Gateway" })) as typeof fetch;
  const { bash, isAbortError } = bind().exec;
  const error = await bash("ls").catch((e: unknown) => e);
  expect(String(error)).toContain("Bad Gateway");
  expect(isAbortError(error)).toBe(false);
});

test("the classifier terminates on cycles and accepts arbitrary thrown values", () => {
  const { isAbortError } = bind().exec;
  const a = new Error("a"),
    b = new Error("b", { cause: a });
  a.cause = b;
  expect(isAbortError(a)).toBe(false);
  Object.assign(b, { aborted: true });
  expect(isAbortError(a)).toBe(true);
  for (const error of [null, undefined, true, 42, "AbortError", { aborted: "true" }, new Error("AbortError")]) expect(isAbortError(error)).toBe(false);
  expect(
    isAbortError({
      get cause() {
        throw new Error("getter failed");
      },
    }),
  ).toBe(false);
  expect(
    isAbortError(
      new Proxy(
        {},
        {
          has() {
            throw new Error("proxy failed");
          },
        },
      ),
    ),
  ).toBe(false);
});

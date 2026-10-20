/**
 * The guards and the cache in `bindings.ts`.
 *
 * `stream.test.ts` covers the `$dsh/ai` path only. Measured by inverting each condition alone:
 * eight of the fifteen `if`s in this module changed nothing that any test asserted — including
 * every "no host bound" and "needs a session workspace" guard on `fs` and `exec`, both
 * `!response.ok` denials, and the `bindingImports` cache. A card calling `readFile` with no host
 * would have returned a URL query containing `undefined` rather than saying so.
 */
import { restoreGlobals } from "./globals.ts";
import { beforeEach, afterEach, expect, test } from "bun:test";
import { EXEC_PATH, FS_PATH } from "../src/contract-assets.ts";
import { bind, bindingImports, registerUi4aHost, releaseBindings } from "../src/client/runtime/bindings.ts";

let release: (() => void) | undefined;
// Before, not only after. The module-level host is shared with every other test FILE — bun
// keeps one module registry per RUN — so the "no host bound" test below asserts a state this
// file must ESTABLISH rather than assume. In file order nothing has bound one yet; under
// `--randomize` another file may have registered one and not released it.
//
// `releaseBindings()` does NOT do this: it revokes cached blob URLs and leaves `host` alone.
// Registering a throwaway host and immediately calling its disposer is the only way to reach
// the module's `host = null` from outside.
beforeEach(() => {
  releaseBindings();
  registerUi4aHost({} as never)();
});
afterEach(() => {
  release?.();
  release = undefined;
  restoreGlobals();
  releaseBindings();
});

const hostWith = (cwd: string | undefined) => registerUi4aHost({ cwd: () => cwd, sessionId: () => "s1" } as never);

test("with no host bound, fs and exec say so instead of building a URL", () => {
  expect(() => bind().fs.readFile("a.txt")).toThrow("no host bound");
  // `sendMessage` drives the next turn; with no host it would silently swallow the card's turn.
  expect(() => bind().chat.sendMessage("hi")).toThrow("no host bound");
  expect(() => bind().exec.bash("ls")).toThrow("no host bound");
});

test("a host without a workspace names the missing workspace, not the missing host", () => {
  release = hostWith(undefined);
  expect(() => bind().fs.readFile("a.txt")).toThrow("$dsh/fs needs a session workspace");
  expect(() => bind().exec.bash("ls")).toThrow("$dsh/exec needs a session workspace");
});

// A denial carries the route's own `error` so the card can say "this session is read-only".
test("a rejected fs or exec request surfaces the route's reason", async () => {
  release = hostWith("/tmp");
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://x").pathname;
    expect([FS_PATH, EXEC_PATH]).toContain(path);
    return new Response(JSON.stringify({ error: "read-only session" }), { status: 403 });
  }) as typeof fetch;
  await expect(bind().fs.readFile("a.txt")).rejects.toThrow("read-only session");
  await expect(bind().exec.bash("ls")).rejects.toThrow("read-only session");
});

/**
 * The reason has to be a FIELD, not only a sentence.
 *
 * A card that wants to draw "this session is read-only" differently from "that file is gone"
 * can only do so by branching, and branching on our message text makes every reword a breaking
 * change for cards already written. `denied` says which of the two it is; `code` carries the
 * host's own name for it.
 */
test("a denial is told from an outage by a field, not by the message", async () => {
  release = hostWith("/tmp");
  const failWith = (status: number, error: string) => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error }), { status })) as typeof fetch;
  };
  failWith(403, "FS_SANDBOX_DENIED");
  const refused = await bind()
    .fs.writeFile("a.txt", "x")
    .catch((e: unknown) => e as { denied?: boolean; code?: string });
  expect(refused.denied).toBe(true);
  expect(refused.code).toBe("FS_SANDBOX_DENIED");
  // A missing file is not a denial: same rejection shape, `denied` false, so a card that
  // branches on it offers a retry here and does not offer one above.
  failWith(404, "ENOENT");
  const missing = await bind()
    .fs.readFile("a.txt")
    .catch((e: unknown) => e as { denied?: boolean; code?: string });
  expect(missing.denied).toBe(false);
  expect(missing.code).toBe("ENOENT");
});

// `statusText` is the fallback when the route dies before writing a body at all.
test("a denial with no body still names something", async () => {
  release = hostWith("/tmp");
  globalThis.fetch = (async () => new Response("<html>", { status: 502, statusText: "Bad Gateway" })) as typeof fetch;
  await expect(bind().fs.readFile("a.txt")).rejects.toThrow("Bad Gateway");
});

/**
 * The blob URLs are built once. Rebuilding them per call would leak a URL per import and, worse,
 * hand two surfaces different module identities for `$dsh/fs` — the same singleton problem that
 * makes a second React instance render blank.
 */
test("the binding blobs are built once and revoked on release", () => {
  const first = bindingImports();
  expect(bindingImports()).toBe(first);
  releaseBindings();
  expect(bindingImports()).not.toBe(first);
});

test("session shims are distinct and share a stable internal module", async () => {
  const a = bindingImports("a");
  const b = bindingImports("b");
  expect(bindingImports("a")).toBe(a);
  expect(a["$dsh/fs"]).not.toBe(b["$dsh/fs"]);
  const aSource = await (await fetch(a["$dsh/fs"])).text();
  const bSource = await (await fetch(b["$dsh/fs"])).text();
  // Opaque handles, never the session id: generated code that reads its own shim cannot name
  // another session, because `bindOwner` only resolves a handle this module minted.
  const handleOf = (source: string) => source.match(/bindOwner\("([^"]+)"\)/)![1];
  const aHandle = handleOf(aSource);
  const bHandle = handleOf(bSource);
  expect(aHandle).not.toBe(bHandle);
  expect(aSource).not.toContain('"a"');
  expect(bSource).not.toContain('"b"');
  const internal = aSource.match(/from "(blob:[^"]+)"/)![1];
  expect(bSource).toContain(internal);
  expect((await fetch(internal)).ok).toBe(true);
  // And the internal module is not advertised: `$dsh/internal` resolves for no generated card.
  expect((await import("../src/client/runtime/bindings")).localImports("a")).not.toHaveProperty("$dsh/internal");
});

test("a capability handle cannot be forged into another session", async () => {
  const { bindOwner, bindingImports, registerUi4aHost } = await import("../src/client/runtime/bindings");
  release = registerUi4aHost({ cwd: (owner) => owner, sessionId: () => "selected", send() {} });
  const source = await (await fetch(bindingImports("victim")["$dsh/fs"])).text();
  const handle = source.match(/bindOwner\("([^"]+)"\)/)![1];
  expect(() => bindOwner("victim")).toThrow("no such capability handle");
  expect(() => bindOwner(handle + "x")).toThrow("no such capability handle");
  const urls: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://local");
    urls.push(url);
    return Response.json({ content: "ok" });
  }) as typeof fetch;
  await bindOwner(handle).fs.readFile("x");
  expect(urls.at(-1)!.searchParams.get("session")).toBe("victim");
});

test("AI and web requests use the bound owner's workspace", async () => {
  release = registerUi4aHost({ cwd: (owner) => (owner === "a" ? "/a" : "/b"), sessionId: () => "b", send() {} });
  const urls: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://local");
    urls.push(url);
    return url.pathname.endsWith("search") ? Response.json({ sources: [], truncated: false }) : new Response("answer");
  }) as typeof fetch;
  const canvas = bind("a");
  for await (const _chunk of canvas.ai.streamText("hi")) {
    /* consume the response */
  }
  await canvas.web.search("hi");
  expect(urls).toHaveLength(2);
  expect(urls.every((url) => url.searchParams.get("cwd") === "/a")).toBe(true);
});

test("a retained canvas keeps its owner and reads that owner's current access mode", async () => {
  const sessions = new Map([
    ["a", { cwd: "/a", writable: false }],
    ["b", { cwd: "/b", writable: true }],
  ]);
  let selected = "a";
  const sent: string[] = [];
  release = registerUi4aHost({
    sessionId: () => selected,
    cwd: (owner) => sessions.get(owner ?? selected)?.cwd,
    send: (_text, owner) => {
      const id = owner ?? selected;
      if (!sessions.has(id)) throw new Error("owning session is unavailable");
      sent.push(id);
    },
  });
  const urls: URL[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://local");
    urls.push(url);
    const owner = url.searchParams.get("session")!;
    if (init?.method === "POST" && url.pathname === FS_PATH && !sessions.get(owner)?.writable) return Response.json({ error: "FS_SANDBOX_DENIED" }, { status: 403 });
    return Response.json({ content: "ok", stdout: "ok" });
  }) as typeof fetch;
  const canvas = bind("a");
  selected = "b";
  await canvas.fs.readFile("file.txt");
  await expect(canvas.fs.writeFile("file.txt", "x")).rejects.toThrow("FS_SANDBOX_DENIED");
  await canvas.exec.bash("pwd");
  canvas.chat.sendMessage("hi");
  expect(sent).toEqual(["a"]);
  expect(urls.every((url) => url.searchParams.get("cwd") === "/a" && url.searchParams.get("session") === "a")).toBe(true);
  sessions.get("a")!.writable = true;
  sessions.get("a")!.cwd = "/b";
  await canvas.fs.writeFile("file.txt", "x");
  expect(urls.at(-1)!.searchParams.get("session")).toBe("a");
  expect(urls.at(-1)!.searchParams.get("cwd")).toBe("/b");
  sessions.delete("a");
  await expect(canvas.fs.readFile("file.txt")).rejects.toThrow("needs a session workspace");
  expect(() => canvas.exec.bash("pwd")).toThrow("needs a session workspace");
  expect(() => canvas.chat.sendMessage("hi")).toThrow("owning session is unavailable");
});

// The teardown returned by `registerUi4aHost` must not unbind a host that replaced it.
test("releasing a stale host does not unbind the current one", () => {
  const stale = hostWith("/a");
  release = hostWith("/b");
  stale();
  // The guard throws synchronously, before any request: asserting through the promise instead
  // makes the test depend on whatever `fetch` happens to be installed.
  globalThis.fetch = (async () => new Response("{}")) as typeof fetch;
  expect(() => bind().fs.readFile("x")).not.toThrow();
});

// `$dsh/internal` used to be registered inside `registerUi4aHost`, so a surface that came up
// before any host — a preview, a harness, the first frame of a session, any profile without
// `conversation` — got capability blobs importing an empty module. The first mount reported
// `Unresolvable imports` and every one after it rendered silently blank. Nothing in `bind`
// depends on the host *value*, so nothing about it belongs behind that call.
test("capability modules resolve without a host registered", async () => {
  const { bindingImports, bind } = await import("../src/client/runtime/bindings");
  const imports = bindingImports();
  const groups = Object.keys(bind());
  expect(groups.length).toBeGreaterThan(0);
  for (const group of groups) {
    const url = imports[`$dsh/${group}`];
    expect(url).toBeDefined();
    const source = await (await fetch(url)).text();
    // Each blob re-exports from the `$dsh/internal` blob; an unregistered one is an empty module.
    const internalUrl = source.match(/from "(blob:[^"]+)"/)?.[1];
    expect(internalUrl).toBeDefined();
    expect(await (await fetch(internalUrl!)).text()).toContain("bind");
  }
});

test("the capability bridge is sealed before any card can run", async () => {
  // The key is minted, not a well-known name: a card cannot pre-install a wrapper under a key it
  // cannot predict. Whatever it is, it is sealed by the time any shim exists.
  await import("../src/client/runtime/bindings");
  const keys = Reflect.ownKeys(globalThis).filter((key) => typeof key === "string" && key.startsWith("__dsh_generative_ui_bind_"));
  // Every generation mints its own key — the reload test makes more than one, and the suite runs
  // its files in random order — so this is "all of them", not "exactly one".
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    const own = Object.getOwnPropertyDescriptor(globalThis, key)!;
    expect(own.writable).toBe(false);
    expect(own.configurable).toBe(false);
    expect(own.enumerable).toBe(false);
    expect(() => ((globalThis as any)[key as string] = () => null)).toThrow();
  }
});

test("a second module evaluation keeps HMR working instead of redefining the bridge", async () => {
  const before = Reflect.ownKeys(globalThis).filter((key) => typeof key === "string" && key.startsWith("__dsh_generative_ui_bind_"));
  await import(`../src/client/runtime/bindings.ts?reload=${Math.random()}`);
  const after = Reflect.ownKeys(globalThis).filter((key) => typeof key === "string" && key.startsWith("__dsh_generative_ui_bind_"));
  // A reload mints and seals its own key rather than tripping over the previous, non-configurable one.
  expect(after.length).toBe(before.length + 1);
});

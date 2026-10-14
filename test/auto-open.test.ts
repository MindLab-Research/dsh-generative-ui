/**
 * The canvas auto-open sweep: which tool calls say "show this canvas", and which say nothing.
 *
 * Driven over the real `collectCanvases` with fixture `argsRaw` rather than a stub of it — the
 * detector under test is the production one, and the cases below are the three ways it can be
 * wrong (open on a read, fail to open on an edit, open twice on the same state).
 */
import { expect, test } from "bun:test";
import { canvasAddress, createCanvasAutoOpen, openSignature } from "../src/client/canvas/auto-open.ts";
import type { ToolCallView } from "../src/client/canvas/collect.ts";

const SID = "s1";
const write = (id: string, code: string, settled = true): ToolCallView => ({ name: "write", argsRaw: JSON.stringify({ path: `/home/me/proj/.dsh/ui4a/canvases/${id}.ui4a.tsx`, content: code }), settled });
const patch = (id: string, settled = true): ToolCallView => ({ name: "str_replace_editor", argsRaw: JSON.stringify({ path: `/home/me/proj/.dsh/ui4a/canvases/${id}.ui4a.tsx`, old_str: "a", new_str: "b" }), settled });
const read = (id: string): ToolCallView => ({ name: "read", argsRaw: JSON.stringify({ path: `/home/me/proj/.dsh/ui4a/canvases/${id}.ui4a.tsx` }), settled: true });
const unrelated = (): ToolCallView => ({ name: "write", argsRaw: JSON.stringify({ path: "/home/me/proj/README.md", content: "hi" }), settled: true });

/** Drives one auto-open over a growing transcript — the shape production has: calls arrive, they do not swap. */
function harness() {
  let calls: readonly ToolCallView[] = [];
  const opens: string[] = [];
  const { sweep } = createCanvasAutoOpen({
    calls: () => calls,
    sessionId: () => SID,
    open: (session, id) => opens.push(`${session}/${id}`),
  });
  return {
    opens,
    sweep,
    /** Append a call and sweep once, the way a mutation would. */
    push(...next: ToolCallView[]) {
      calls = [...calls, ...next];
      sweep();
    },
  };
}

test("a settled write opens the canvas once", () => {
  const h = harness();
  h.push(write("todo", "export default () => null"));
  expect(h.opens).toEqual(["s1/todo"]);
  h.sweep();
  expect(h.opens).toEqual(["s1/todo"]);
});

test("reading a canvas opens nothing", () => {
  // The trap `collect.ts` exists to avoid: asking what a file contains used to conjure a panel
  // for a canvas this session never wrote.
  const h = harness();
  h.push(read("todo"), read("notes"));
  expect(h.opens).toEqual([]);
});

test("a path outside the contract opens nothing", () => {
  const h = harness();
  h.push(unrelated(), { name: "write", argsRaw: JSON.stringify({ path: "/home/me/proj/src/util.ts", content: "x" }), settled: true });
  expect(h.opens).toEqual([]);
});

test("writing a canvas's own sub-page surfaces that canvas", () => {
  // Not a violation of the contract check — `owningCanvasIdOf` is the point: `todo/deck.tsx` is
  // inside `todo`, and the canvas re-renders with the new sub-page inlined into it.
  const h = harness();
  h.push(write("todo/deck", "export const a = 1"));
  expect(h.opens).toEqual(["s1/todo"]);
});

test("an unsettled write waits for the stream to settle", () => {
  // Opening per frame would bump the tab's navigation revision each time and make the body
  // re-read the file once per token, for content that is not written yet.
  const h = harness();
  h.push(write("todo", "expo", false));
  expect(h.opens).toEqual([]);
  h.push(write("todo", "export default () => null", false));
  expect(h.opens).toEqual([]);
  h.push(write("todo", "export default () => null"));
  expect(h.opens).toEqual(["s1/todo"]);
});

test("an edit re-opens, even for a canvas this session never wrote", () => {
  const h = harness();
  h.push(patch("yesterday"));
  expect(h.opens).toEqual(["s1/yesterday"]);
  h.push(patch("yesterday"));
  // A second patch is another stale version — the body has to re-read.
  expect(h.opens).toEqual(["s1/yesterday", "s1/yesterday"]);
});

test("the same state is not acted on twice", () => {
  const h = harness();
  h.push(write("todo", "body"), patch("todo"));
  // One snapshot, one state, one open — the write and the patch that followed it are read
  // together, not as two events.
  expect(h.opens).toEqual(["s1/todo"]);
  h.sweep();
  h.sweep();
  expect(h.opens).toEqual(["s1/todo"]);
});

test("a rewrite after the reader closed the tab brings it back", () => {
  // What replaced the per-session `dismissed` set: closing is sticky only until the file moves.
  const h = harness();
  h.push(write("todo", "one"));
  expect(h.opens).toEqual(["s1/todo"]);
  h.push(write("todo", "one longer body"));
  expect(h.opens).toEqual(["s1/todo", "s1/todo"]);
});

test("without a session there is nothing to open into", () => {
  const opens: string[] = [];
  const { sweep } = createCanvasAutoOpen({
    calls: () => [write("todo", "body")],
    sessionId: () => undefined,
    open: (_session, id) => opens.push(id),
  });
  sweep();
  expect(opens).toEqual([]);
});

test("the address is workspace-relative and round-trips", () => {
  // Absolute tool paths are machine-specific; the address names the file inside the session's
  // own workspace so the host resolves it there. `canvasIdOf` must be able to read it back.
  const address = canvasAddress(SID, "背单词");
  expect(address).toBe("dsh-resource://file/session/s1/.dsh/ui4a/canvases/%E8%83%8C%E5%8D%95%E8%AF%8D.ui4a.tsx");
});

test("openSignature is what makes a sweep free when nothing moved", () => {
  const collected = { canvases: [{ id: "todo", code: "abc", streaming: false }], stale: new Map<string, number>() };
  expect(openSignature("todo", collected)).toBe("s0:c3");
  expect(openSignature("todo", { ...collected, stale: new Map([["todo", 2]]) })).toBe("s2:c3");
  expect(openSignature("todo", { canvases: [{ id: "todo", code: "abc", streaming: true }], stale: new Map() })).toBe("streaming");
  // An edit to a canvas never written here is synthesized with an empty body; it still moves.
  expect(openSignature("ghost", collected)).toBe("stale:0");
});

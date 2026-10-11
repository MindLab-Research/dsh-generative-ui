/**
 * The skill's generated paragraph about which import map serves which command.
 *
 * Three states, because the two maps have genuinely different lifetimes — the type map can
 * exist while the stub one does not. Nesting these interpolations inline is how this file
 * broke twice, and the failure mode is bad advice reaching the model rather than an exception:
 * a wrong `-i` flag makes every `$dsh/*` import report `Cannot find module`, and the model
 * then "fixes" imports that were correct.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderSkillContent } from "@deepseek-ai/dsh-skill";
import { CAPABILITY_PREFIX } from "../src/contract.ts";
import { CLI_URL, mapNotes, skillEntry, skillPath, skillResourceBase, SKILL_DESCRIPTION, SKILL_NAME } from "../src/skill.ts";

describe("mapNotes", () => {
  // No type map means no `-i` advice at all: telling the model to pass a flag pointing at a
  // file that does not exist is worse than saying nothing.
  test("without a type map the paragraph is empty", () => {
    expect(mapNotes(undefined, undefined)).toBe("");
    expect(mapNotes(undefined, "stub.json")).toBe("");
  });

  test("with only a type map, build and dev are called out as unsupported", () => {
    const notes = mapNotes("types.json", undefined);
    expect(notes).toContain(CAPABILITY_PREFIX);
    expect(notes).toContain("`build` and `dev` want runnable JS and will fail on it");
    // Nothing may promise a second map that is not there.
    expect(notes).not.toContain("-i stub.json");
  });

  test("with both maps, build gets the stub map by name", () => {
    const notes = mapNotes("types.json", "stub.json");
    expect(notes).toContain("-i stub.json");
    expect(notes).toContain("build <file>");
    // The earlier wording must not survive alongside the command that contradicts it.
    expect(notes).not.toContain("will fail on it");
  });

  // The tell for the interpolation bug this guards: an unevaluated `${` reaching the model.
  test("no state leaks a raw template placeholder", () => {
    for (const notes of [mapNotes("t.json", "s.json"), mapNotes("t.json", undefined), mapNotes(undefined, undefined)]) {
      expect(notes).not.toContain("${");
      expect(notes).not.toContain("undefined");
      expect(notes).not.toContain("[object Object]");
    }
  });
});

test("the packaged entrypoint and reference base agree with the registration", () => {
  const source = readFileSync(skillPath, "utf8");
  expect(SKILL_DESCRIPTION).toContain("adjustable calculations, recommendations, and option requests");
  expect(source).toContain(`name: ${SKILL_NAME}`);
  expect(source).toContain(`description: ${SKILL_DESCRIPTION}`);
  expect(readFileSync(join(skillResourceBase.path, "references/checking.md"), "utf8")).toContain(CLI_URL);
  const rendered = renderSkillContent({ name: SKILL_NAME, provider: "runtime", resourceBase: skillResourceBase, content: skillEntry("types.json", "standalone.json", true) });
  expect(rendered).toContain(`Base directory for this skill: ${skillResourceBase.path}`);
  expect(rendered).toContain("references/layout.md");
  expect(rendered).not.toContain("## Layout");
});

test("the progressive entrypoint hands durable requests to the first canvas write", () => {
  const entry = skillEntry("types.json", "standalone.json", true);
  expect(entry).toContain("immediately write the");
  expect(entry).toContain("first usable file to `.dsh/ui4a/canvases/<id>.ui4a.tsx`");
  expect(entry).toContain("another design/planning skill");
  const lifetime = readFileSync(join(skillResourceBase.path, "references/lifetime.md"), "utf8");
  expect(lifetime).toContain("same id and path");
  expect(lifetime).toContain("usePersistedState");
});

test("the progressive entrypoint keeps the inline fence and reference-read contracts", () => {
  const entry = skillEntry("types.json", "standalone.json", true);
  expect(entry).toContain("exactly four backticks followed by `ui4a/tsx`");
  expect(entry).toContain("Do not call the `generative-ui` skill again with the same name");
  expect(entry).toContain("loan or mortgage calculations");
  expect(entry).toContain("BMI thresholds or calculators");
  expect(entry).toContain("unit conversions");
  expect(entry).toContain("Any unit conversion is still an inline card when the user gives only one input");
  expect(entry).toContain("several candidates, recommendations, or options");
  expect(entry).toContain("Before writing a candidate or recommendation card, read `references/lifetime.md`");
  expect(entry).toContain("Source-check the card before sending");
  expect(entry).toContain("guard against a second send after the persisted answer");
  expect(entry).toContain("must not claim that the user already chose one");
  expect(entry).toContain("it must contain both `sendMessage` and `usePersistedState`");
  expect(entry).toContain("Do not promise a control that the card does not render");
  expect(entry).toContain("Fixed factual lookups");
  expect(entry).toContain("put the short introduction on its own line");
  expect(entry).toContain("open the exact four-backtick `ui4a/tsx` fence on the next line");
  expect(entry).toContain("never append the opener to the introduction on one line");
  expect(entry).toContain("do not reload this skill");
  expect(entry).toContain("on its own line");
  expect(entry).toContain("required `file_path` argument");
  expect(entry).toContain("`file_path` is the only valid argument");
  expect(entry).toContain("or an empty read call");
  expect(entry).toContain("when the card or canvas uses the concern it covers");
  expect(entry).toContain("initialize every value that is visible on the first render");
});

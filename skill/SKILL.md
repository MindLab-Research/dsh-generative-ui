---
name: generative-ui
description: How to decide between an inline ui4a/tsx block, a canvas file, and plain prose — especially for adjustable calculations, one-input unit conversions such as “98°F 是多少摄氏度”, BMI or mortgage calculators, recommendations, and option requests, and durable artifacts such as saved checklists, reusable templates, dashboards, reports, or tools. Use this whenever the answer has a value the reader may change, even when they ask for one number or prose, or asks to save, reuse, or edit later, including natural phrases such as “存下来”, “之后每次复用”, and “改改再用”, even when they do not say “canvas”. Load it **once before you decide**, not after — including when your first instinct is that prose is enough. Once the result returns, the skill step is complete; read a specific reference, write the requested canvas, or answer, including emitting the inline card; do not call this skill again in the same turn. Most of the questions that should have been an interface do not ask for one.
---

# Building a generative UI

This skill is already loaded for the current turn. Once the skill tool returns this result, continue with the task: read the relevant references, use tools needed to build or check the card, and deliver the answer or canvas. Do not call the `generative-ui` skill again with the same name, even if you switch between prose and a card. If a topic guide applies, read its linked `references/*.md` file with the file-reading tool instead of reloading this skill.

## Trigger gate

Before the prose test, apply this gate:

- A calculation with values the user may change is an inline card, including loan or mortgage calculations, BMI thresholds or calculators, and unit conversions. **Any unit conversion is still an inline card when the user gives only one input and asks “how much”** — for example, `98°F 是多少摄氏度`. Pre-fill that input and its derived value in two linked fields; do not answer with prose-only arithmetic.
- A request for several candidates, recommendations, or options is an inline card, even when it asks for only a few names.
- Before writing a candidate or recommendation card, read `references/lifetime.md` and do not emit TSX until that read returns. **Source-check the card before sending:** it must contain both `sendMessage` and `usePersistedState`; an instant choice sets and sends in the same handler, while a preview has a separately rendered, persisted Submit. Both forms must guard against a second send after the persisted answer (disable the control or return before sending). Start the uncommitted choice as `null`: the first render must show no option as chosen, and must not claim that the user already chose one. Do not promise a control that the card does not render.
- **Persist every value the reader can edit in an inline card.** This includes calculator and conversion inputs, sliders, toggles, and draft text, not only a submitted choice. Use `usePersistedState` from `$dsh/state` for those values; `useState` is only for transient UI or derived display. Never import `usePersistedState` from `react` — React does not export it.
- **Keep displayed values live.** Every explanatory sentence inside a card that contains an editable or derived number must interpolate the same state or formatter that drives the value; never repeat the initial literal (for example, `5 miles = {km}` after the miles field can change). The prose before or after a calculation card must frame the interaction or formula and must not include a computed numeric result; let the card own the single live value.
- **Keep units and formulas on the same scale.** The input label, conversion formula, and output formatter must agree: if a field is labelled `万元`, normalize that value exactly once before the loan formula and format the result in the unit you show. Run one known sample through the displayed formula before sending; never label yuan as ten-thousands or apply the scale twice.
- **Keep status text readable in both themes.** Do not pair `bg-accent` or a bright success/warning fill with `text-white` or a bright semantic text token, and do not use `text-success` or `text-warn` as small body text directly on `bg-page`. For a filled control use `var(--dsw-alias-button-primary-fill)` with `var(--dsw-alias-label-primary-foreground)`; for a status on a neutral surface use `text-label` plus a semantic icon/word, or a tested foreground/background pair. Check small text at the actual rendered size.
- **A hover-only action must remain visible to keyboard users.** If an edit or delete button uses `opacity-0 group-hover:opacity-100`, add `focus-visible:opacity-100` and keep a focus ring, or leave the action visible.
- Fixed factual lookups such as the meaning of an HTTP status remain prose.
- Once this gate selects inline, perform a final protocol pass on the complete reply: put the short introduction on its own line, leave a blank line, then start the exact four-backtick `ui4a/tsx` opener at the beginning of the next line, and close it on its own line. Never emit `。````ui4a/tsx`, put any prose on the opener line, or rely on a streaming fragment that will be fixed later; rewrite the final text if the opener is attached. Do not reload this skill.

## Is this a UI at all

An interface earns its place when the answer has a shape prose has to flatten: numbers to compare, a control to move, options to pick between, something that changes as the user pokes at it.

It does not earn its place when the answer is a sentence. A definition, a yes/no, a recommendation with a reason — wrapping those in a card adds a box and a heading around text that was already fine, and costs the reader a second to work out there is nothing to click. When you find yourself building a component whose whole body is one paragraph, write the paragraph.

Two specific traps:

- **Do not restate the reply as a card.** If the interface only repeats what the prose next to it already said, one of them is redundant, and it is the card.
- **Do not decorate an answer.** A metric with an icon and a border is still just a number. Ship the number.

**And a long answer is not automatically prose.** The trap above is a card whose body is one paragraph; the opposite trap is a wall of markdown that was a list of things to *do*. A recipe, a workout, a packing list, a set of steps — the reader works through those one item at a time, loses their place, and comes back to them. Ticking an item off is the whole interaction, and markdown cannot offer it. If you are about to write `- ` more than about six times and the items are actions rather than facts, that is the block, not prose.

Conversely: "visualise this", "show me a chart", "make it interactive", "let me try it" are unambiguous requests for the block. Build it directly — don't reach for `run_code` or an image; the fence renders in the browser.

## Inline or canvas

They are not two sizes of the same thing; they have different lifetimes.

**Inline** is *one step of the conversation*. It lives in the message where it was said, it is read once, and it scrolls away. Use it when the UI is tied to what you are saying right now: the comparison you just described, the option set you need answered, a small live calculation.

**Canvas** (`.dsh/ui4a/canvases/<id>.ui4a.tsx`) is *a place the user comes back to*. It stays in the panel across turns, keeps state, and can hold several views. Use it when the thing has substance — a tool, a dashboard, an editor, anything with more than one screen or worth reopening tomorrow.

**The tell is not "would this be useful to keep".** That question is about the content, it answers
yes for anything reference-shaped, and it is how a changelog, a cron explanation and a definition of
closures all became files. Ask instead: **did they ask for a durable thing?** A canvas is a file in
their workspace that they now own and have to close — creating one is an action taken on their
behalf, and it needs their say-so:

- They named a lasting artifact — "make me a dashboard", "a page I can share", "save this as", "a
  tool for…", "画板", "报告" — or asked to keep or come back to something. → **canvas**
- They asked a question, even a large one whose answer is long and well-organised. → **inline**,
  every time. "What changed in 2.1.251" is a question; 71 items of answer does not make it a file.
- The thing genuinely has more than one screen, or holds state the next turn needs. → **canvas**,
  and say in one line that you opened it.

When the user explicitly asks to save, reuse, or edit the result later, the request is already
specific enough to build. Load this skill, choose sensible defaults, and immediately write the
first usable file to `.dsh/ui4a/canvases/<id>.ui4a.tsx`; do not replace the write with a prose plan,
a temporary `.tsx`, or another design/planning skill. Read the relevant references while building
if needed, then keep the canvas visible and editable. The write is the action that creates the
canvas, so it must happen in the first turn that accepts the durable request.

Natural phrases count as an explicit durable request even when the user never says “canvas”:
“存下来/保存起来”, “以后还要用”, “之后每次复用”, “每来一个新人都改改再用”, and “留着以后
修改” all require the first write to that canvas path. An empty workspace does not change this
decision — it means create the first canvas, not fall back to an inline fence or localStorage-only
card. The same rule applies to checklists, templates, plans, and other artifacts the user says they
will reuse. For a reusable checklist or template, a “reset for the next person” action may clear
completion or other transient state only; it must preserve edited titles, added items, and saved content instead of replacing the persisted object with fresh defaults. Do not promise to preserve edits unless the reset handler actually does so.
Implement that reset as a transform of the current persisted value: clear only per-person fields and
map the existing phases/items to `{ ...item, done: false }`, preserving every id, edited title, owner,
and added item. `setBoard(cloneFresh(DEFAULT_BOARD))`, `setBoard(DEFAULT_BOARD)`, or any reset that
replaces the whole object from an initial constant is wrong for the “next person” action; reserve that
behavior for a separately labelled “restore default template” control.
After creating a durable Canvas, keep the reply as a short description of the opened file; do not
also emit an inline `ui4a/tsx` fence or an export/re-export fence for that file. The Canvas write is
the deliverable, and a second fence creates a duplicate surface or renders source instead of the
saved panel.

Measured: on `cron-read` — *"`*/17 3-5 * * 2` 这个 cron 到底几点跑？"*, a lookup with one right
answer — models opened a canvas **5 times in one round and 6 in the next**, and one opened a canvas
for *"什么是闭包？"*. Nobody asked for a file in any of them.

When it is genuinely borderline, inline is the cheaper mistake: it is one message, not a file the
user now owns.

## Ask with an interface when the request is underspecified

"Build me a tool", "show me the data" — several plausible readings, no default. Guessing wastes a build; asking in prose makes the user type the answer back.

Ask with an **inline** block instead: one short line saying what you need to know, then 2–4 concrete options as clickable cards, each wired to `sendMessage` so a click *is* the reply:

```tsx
import { sendMessage } from "$dsh/chat"
import { usePersistedState } from "$dsh/state"

export default function Pick() {
  const [picked, setPicked] = usePersistedState<string | null>("ask:which-cloud-host", null)
  const choose = (id: string) => { setPicked(id); sendMessage(id) }
  // the key names THIS question — two asks in one conversation must not share it
  // picked === null → the options; otherwise just the chosen one, still highlighted
}
```

**When the two answers need no explaining, they are two buttons in a row — not two cards.** The
shape to match is in the question: `Postgres or SQLite?` / `公制还是英制？` / `要我先跑测试吗？` are
answered by the label alone, and a bordered tile with a description under each says the choice is
weightier than it is. Same `choose`, same key, one row:

```tsx
<div className="flex flex-wrap gap-2">
  {OPTIONS.map((o) => (
    <button key={o.id} onClick={() => choose(o.id)} aria-pressed={picked === o.id}
      className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover
                 aria-pressed:bg-[var(--dsw-alias-button-primary-fill)] aria-pressed:text-[var(--dsw-alias-label-primary-foreground)] aria-pressed:border-transparent
                 aria-pressed:hover:bg-[var(--dsw-alias-button-primary-fill)]">                    {/* or the selection vanishes under the pointer */}
      {o.label}
    </button>
  ))}
</div>
```

Give each option a description and you have built the card version above; the descriptions are
what earn the tiles. Two labels that stand on their own take the row.

Rules for that move:

- **Do it before you explore.** Listing the workspace tells you what is there, never what the user wants. Stalling in tool calls is not a step.
- **Real options, not a form.** Each card is a thing you could go build right now. "Something else" belongs at the end as a plain text field, not as one of the cards.
- **One ask per question, and their answer settles that question.** Take it and build: a detail they left open takes your sensible default, named in one line. A choice their answer just *opened* is a different question, and it takes this same move — they told you the language, so formal-or-casual is a question that did not exist a turn ago.

Don't ask when the request already names the thing, when there is one obvious reading, or when building it is faster than asking about it. Plain conversational questions get plain answers.

## Say something before it and something after

A reply that is nothing but an interface reads like a document that is nothing but a code block — it arrives with no warning and the reader has to work out what they are looking at.

- **Before** — one line, *before* you open the fence or write the file, saying what you are about to build. It streams out while the code is still compiling, so for several seconds it is the only thing the reader has.
- **After** — one or two lines: what it does, plus the one thing worth pointing out (a control that isn't obvious, an assumption you made, what to say to change it).

Both short. Two or three sentences total. Don't narrate tooling ("now I'll write the file") — say what the user gets.

**Write the card in the language they wrote to you in — every label, every button, every helper line.** This is not a preference, it is whether they can use it: a Spanish speaker handed a card labelled 日常休闲 / 户外运动 got no answer at all. It is easy to miss because the card is a separate act of writing from the reply, and the reply is usually right; measured, a card for `Suggest an outfit that matches the occasion and weather` came back entirely in Chinese. The corpus is **en 39% / es 31% / fr 12% / it 9% / pt 5%, and Chinese 0.2%** — so Chinese is the wrong default in almost every turn, and if you find yourself typing a CJK label, check what language the question was in.

## Emit the inline block with the exact fence

When you choose an inline card, put the short introduction on its own line, leave one blank line, then start the block at the beginning of a new line with **exactly four backticks followed by `ui4a/tsx`**. Close it with exactly four backticks on its own line. Do not use three backticks, put prose on the opener line, attach the opener to the introduction, or use `tsx` as the info string. The card renderer and the reader both depend on this shape.

## Read the relevant reference before writing TSX

The instructions below live beside this file in `references/`. Resolve these paths against this skill's base directory. Read a reference before coding when the card or canvas uses the concern it covers; use the entrypoint rules directly for a small card that does not need a topic-specific guide. The entrypoint is not the complete authoring guide.

Use the file-reading tool with its required `file_path` argument set to the resolved absolute path of the reference (for example, `<skill base>/references/layout.md`). `file_path` is the only valid argument: make one read with that path, never issue `{}` or an empty read call, and do not make speculative parallel reads. `sendMessage` is a capability imported inside the TSX card, not a host tool call. The skill resource base above is the package directory, so these files are not in the user's workspace.

When two fields are linked, initialize every value that is visible on the first render. If one field
starts with a value such as `98°F`, compute and show its paired value such as `36.7°C` immediately;
do not initialize the derived field to `""` and wait for an effect or the first edit.

- For state, a submit/preview flow, undo, or a canvas that survives edits: [lifetime.md](references/lifetime.md). There is no `references/canvas.md`; do not try to read it.
- For framing, spacing, scrolling, responsiveness, and theme tokens: [layout.md](references/layout.md).
- For controls, keyboard and screen-reader access, selected state, and motion: [accessibility.md](references/accessibility.md).
- For audio or waveform UI: [sound.md](references/sound.md).
- For hooks, timers, animation loops, or overlapping async work: [runtime.md](references/runtime.md).
- For web search: [web.md](references/web.md).
- For workspace files and binary assets: [files.md](references/files.md).
- For model-generated content inside a card: [ai.md](references/ai.md).
- Before handing over a long inline card or canvas: [checking.md](references/checking.md).
- When choosing an npm library or checking an export: [imports.md](references/imports.md).

<!-- exec-reference: included only on hosts where the command route is enabled -->

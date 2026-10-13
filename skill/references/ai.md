## Generating content inside the card

`streamText` from `$dsh/ai` is for content whose **answer space is open**, and the trap is
that knowing the subject feels like the same thing as the data being fixed. It is not:

> "I know Tokyo, so the attractions are fixed knowledge — I don't need `streamText` here."

That sentence is from a real generation, and it produced five hardcoded itineraries. The
error is not the knowledge claim; it is that *three-day Tokyo itineraries* is not a set of
five. Writing them out samples the space and presents the sample as the whole. Ask **could I
enumerate every answer**, not *do I know this topic*:

| | Closed — no model call | Open — `streamText` |
| --- | --- | --- |
| Converter | 100°C is one number | |
| Timer | one formula | |
| Itinerary | | any city, any length, any interest |
| Recipe | | whatever they have in the fridge |
| Names | | for a thing you have not been told about |

A closed answer has one right value per input. An open one has as many as the user has ideas,
and hardcoding it produces a card that demos beautifully and dead-ends the moment they want
something you did not think of. Yours is the interface; the content is theirs.

It inherits the app's model, so there is no key to ask for and no setup.

**A second call must cancel the first.** Regenerating as the user types, or offering a Stop
button, means two generations in flight and the reader sees whichever finishes last — not the
newest. Pass an `AbortController`'s signal in the options and abort the previous one; that
stops the generation itself, not just your reading of it.

Measured across 378 real cards: 24 stream from the model and **1** passes a signal. So here it
is as code, since the rule beside it — parse the buffer as it grows — is followed by 22 of the
same 24, and the only difference between them is that one shows the lines:

```tsx
const running = useRef<AbortController | null>(null);
const regenerate = async () => {
  running.current?.abort();                 // whatever is in flight is now stale
  const ctrl = (running.current = new AbortController());
  try {
    for await (const chunk of streamText({ prompt, signal: ctrl.signal })) { /* … */ }
  } catch (error) {
    // The one rejection that is not a failure. Showing it puts "AbortError" on screen
    // every time the user types another character.
    if ((error as Error).name === "AbortError") return;
    throw error;
  }
};
useEffect(() => () => running.current?.abort(), []);   // and on unmount
```

Ask for JSON and parse the buffer as it grows, so items land one at a time rather than all
at once at the end:

```tsx
import { streamText } from "$dsh/ai"
import { parse, Allow } from "partial-json"

let buffer = ""
for await (const chunk of streamText({ prompt: `…Return JSON: {"items":[{"title":"","note":""}]}` })) {
  buffer += chunk
  try { setData(parse(buffer, Allow.ALL)) } catch {}  // half-written JSON throws; skip that frame
}
```

That empty catch is only for the parser around an incomplete frame. Do not wrap the
`streamText` call or the whole generation in `catch { setData(SEED) }`: a gateway, capability, or
permission failure is not a valid empty result. Catch non-abort request failures, put the message
in a visible error state with `aria-live="polite"`, and keep the seed only as an explicitly labelled
fallback if the card tells the reader that generation failed. An `AbortError` from a newer request
or unmount may return without an error message.

**Every field is optional until the stream ends.** `partial-json` hands you the object as it
grows, so an item can arrive with a title and nothing else — and one `item.difficulty.includes(…)`
on that frame throws inside render, which unmounts the whole card mid-generation. Read every
streamed field defensively (`item.steps ?? []`, `item.difficulty === "简单" ? … : …`) and never
call a method on one without a fallback. This is the failure mode of this API, not an edge case.

One user turn per call — there is no conversation here. Anything the card knows from earlier
goes into the prompt it builds. And skip it entirely when the data is genuinely fixed: a
converter, a timer, a colour picker have nothing to generate.

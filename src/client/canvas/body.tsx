/**
 * One canvas tab's body: the file behind the address, rendered.
 *
 * A seat body, not a chrome host. The tab strip, header, close control and width drag are the
 * host's; this is the `GenUISurface` layer and the sub-page resolve that feeds it.
 */
import { useEffect, useState } from "react";
import { parseFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { GenUISurface } from "../runtime/GenUISurface.tsx";
import { canvasIdOfAddress } from "./definition.ts";
import { readCanvasFile } from "./read.ts";
import { useSubPages } from "./subpages.ts";

/**
 * The registrant's business face, bound per tab occurrence.
 *
 * `inject` is a factory: the framework resolves the session and hands it over, so `cwdOf` is
 * asked for a specific session rather than reaching for "whichever one is on screen". Several
 * sessions share a workspace and a tab may belong to one the reader is not looking at — the
 * read route allowlists `cwd` against each session's `header.cwd`, so getting this wrong runs
 * the read under a stranger's allowlist (§3.65 hit the same shape on `$dsh/fs`).
 */
export type CanvasInjected = {
  /** The workspace root a given session reads under. */
  readonly cwdOf: (sessionId: string) => string | undefined;
  /** A canvas that failed to compile; see `runtime/report-error.ts`. */
  readonly onCardError: (message: string, phase: string) => void;
  /** A canvas that painted; see `runtime/report-error.ts`. */
  readonly onCardRendered: (restored: boolean) => void;
};

export type CanvasBodyProps = PropsRuntime<"sidebar.right.pane.tab"> & CanvasInjected;

export function CanvasBody({ useTabInfo, cwdOf, onCardError, onCardRendered }: CanvasBodyProps) {
  const { tab } = useTabInfo();
  const address = tab.contentId;
  const id = canvasIdOfAddress(address);
  const parsed = parseFileAddress(address);
  // The address's own session, not the tab's standard-prop one and never "current": the two
  // only agree when the reader happens to be looking at the session that wrote the canvas.
  const cwd = parsed?.scope === "session" ? cwdOf(parsed.sessionId) : undefined;
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    if (cwd === undefined || id === null) return;
    let live = true;
    void readCanvasFile(cwd, id).then((code) => {
      if (live) setBody(code);
    });
    return () => {
      live = false;
    };
    // `revision` increments on every navigation to this tab, and auto-open re-navigates when an
    // `edit` marks the canvas stale — so a patch is re-read here without the transcript having
    // to carry the new body. `visible` deliberately does not appear: with `keepMounted` the body
    // survives a hide, and re-reading on every return would drop state for nothing.
  }, [cwd, id, tab.navigation.revision]);

  // Disk is the source, so a body read here is always settled. Under the default PTC mode the
  // first frame the transcript shows is settled too (§3.6); off-PTC a top-level `write` briefly
  // has no file, and this stays empty until it lands rather than previewing the arguments.
  const resolved = useSubPages(cwd, body === null || id === null ? undefined : { id, code: body, streaming: false });

  if (id === null) return null;
  return <GenUISurface key={id} code={resolved} streaming={false} onError={(error, phase) => onCardError(error.message, phase)} onRendered={onCardRendered} />;
}

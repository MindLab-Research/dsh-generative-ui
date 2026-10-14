/**
 * The canvas column: one mini app per `ui4a/canvases/<id>.ui4a.tsx`, rendered beside the
 * conversation rather than inside it.
 *
 * Composed rather than configured — the panel owns chrome and selection, `GenUISurface`
 * owns rendering, and the caller owns where canvases come from. That is what lets the
 * same surface back both this and the inline cards.
 */
import { useEffect, useRef, useState } from "react";
import { GenUISurface } from "../runtime/GenUISurface.tsx";
import { useSubPages } from "./subpages.ts";
import type { Canvas } from "./collect.ts";
import { useDismissable } from "./useDismissable.ts";

export type { Canvas } from "./collect.ts";
export { needsResolve, revokeAll, useSubPages } from "./subpages.ts";

export type CanvasPanelProps = {
  canvases: readonly Canvas[];
  /** Every canvas in the workspace, so the header can reach ones this session never wrote. */
  offerable: readonly string[];
  /** The session's workspace, needed to fetch a canvas's sub-page files. */
  cwd: string | undefined;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Reports the panel's width so the host frame can reserve matching space. */
  onWidth: (width: number) => void;
  /** A canvas that failed to compile; see `runtime/report-error.ts`. */
  onCardError?: (message: string, phase: string) => void;
  /** A canvas that painted; see `runtime/report-error.ts`. */
  onCardRendered?: (restored: boolean) => void;
};

/** Cheap gate: only a canvas that actually writes a relative import pays for the pass. */
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
/** Exported for `test/panel-css.test.ts`: the default must be draggable-to. */
export { MIN_WIDTH as MIN_WIDTH_FOR_TEST, MAX_WIDTH as MAX_WIDTH_FOR_TEST };
/**
 * Must equal the `--dgu-panel-width` fallback in `panel.css`.
 *
 * The CSS default is what the panel is painted at before React's inline style lands; this is
 * what the resize state starts from. Different values mean the panel visibly jumps on its first
 * frame — a `panel-css.test.ts` assertion holds them together, since a stylesheet cannot import
 * a constant.
 */
export const DEFAULT_WIDTH = 420;

/**
 * The panel's width for a pointer at `clientX`, clamped to what is usable.
 *
 * Extracted from the drag handler because it is the whole of the arithmetic and none of the
 * DOM: a swapped bound or a flipped subtraction gives a panel that snaps shut or eats the
 * conversation, and the drag itself cannot be exercised without a browser.
 */
/**
 * Which canvas the panel shows, and which ids the "other canvases" menu offers.
 *
 * Both are pure functions of the props and both decide what the reader is looking at, so they
 * are here rather than inline: the fallback is what covers a selected canvas disappearing
 * mid-stream (no cleanup needed — clearing the state as well would be a second render saying
 * the same thing), and `offerable` minus the tabs is what keeps the menu from listing what is
 * already on screen.
 */
export const activeCanvas = (canvases: readonly Canvas[], activeId: string | null) => canvases.find((canvas) => canvas.id === activeId) ?? canvases[canvases.length - 1];

export const otherCanvases = (canvases: readonly Canvas[], offerable: readonly string[]) => offerable.filter((id) => !canvases.some((canvas) => canvas.id === id));

export const widthForPointer = (clientX: number, viewportWidth: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, viewportWidth - clientX));

/** Drag-to-resize on the panel's left edge, mirroring the host's own invisible hit strip. */
export function useResize(initial: number) {
  const [width, setWidth] = useState(initial);
  const frame = useRef(0);
  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute("data-dragging", "");
    const move = (moveEvent: PointerEvent) => {
      // One update per frame: pointermove fires far faster than the panel can lay out.
      if (frame.current !== 0) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        setWidth(widthForPointer(moveEvent.clientX, window.innerWidth));
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.querySelector("[data-dragging]")?.removeAttribute("data-dragging");
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return { width, start };
}

export function CanvasPanel({ canvases, offerable, cwd, onOpen, onClose, onWidth, onCardError, onCardRendered }: CanvasPanelProps) {
  const { width, start } = useResize(DEFAULT_WIDTH);
  useEffect(() => onWidth(width), [width, onWidth]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { open: picking, setOpen: setPicking, anchor: picker } = useDismissable();
  // Only what is not already a tab: the tabs cover this session, this covers the rest.
  const elsewhere = otherCanvases(canvases, offerable);

  // Follow the newest canvas unless the reader has picked one that still exists. A
  // selection that disappears needs no cleanup: the fallback already covers it, and
  // clearing the state as well would only be a second render saying the same thing.
  const active = activeCanvas(canvases, activeId);
  const resolved = useSubPages(cwd, active);

  return (
    <div className="dgu-panel" style={{ "--dgu-panel-width": `${width}px` } as React.CSSProperties}>
      <div className="dgu-resize" onPointerDown={start} style={{ left: 0 }} />
      <div className="dgu-header">
        <span className="dgu-title">{active?.id ?? "Canvas"}</span>
        <span className="dgu-spacer" />
        {elsewhere.length > 0 && (
          <div className="dgu-picker" ref={picker}>
            <button type="button" className="dgu-icon-button" onClick={() => setPicking(!picking)} aria-expanded={picking} aria-label={`其他画布（${elsewhere.length}）`} title={`其他画布（${elsewhere.length}）`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 5.5l4 3.5 4-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {picking && (
              <ul className="dgu-launcher-menu dgu-picker-menu">
                {elsewhere.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="dgu-launcher-item"
                      onClick={() => {
                        setPicking(false);
                        setActiveId(id);
                        onOpen(id);
                      }}
                    >
                      {id}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button type="button" className="dgu-icon-button" onClick={onClose} aria-label="关闭画布" title="关闭画布">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {canvases.length > 1 && (
        <div className="dgu-tabs" role="tablist">
          {canvases.map((canvas) => (
            <button key={canvas.id} type="button" role="tab" className="dgu-tab" aria-selected={canvas.id === active?.id} onClick={() => setActiveId(canvas.id)}>
              {canvas.id}
            </button>
          ))}
        </div>
      )}
      <div className="dgu-body">
        {active === undefined ? (
          <div className="dgu-empty">写入 ui4a/canvases/&lt;id&gt;.ui4a.tsx 后，画布会出现在这里</div>
        ) : (
          // `preserveState` was false here, on the theory that a whole-file replace could
          // "silently keep the old render". It cannot: both of partial-react's reuse branches
          // (`runtime.ts:317` and `:404`) require `updateMode === "push"`, and a canvas arrives
          // whole, so it always runs in `"render"` — measured, the edit lands either way.
          // What preserving buys is the state: `:426` calls the generated component from inside
          // a stable slot wrapper, so its hooks stay on the same fiber across a recompile, and
          // `:424` keys the error boundary off the hook signature instead of the render round.
          // Without it every edit remounted the tree and a running timer went back to zero.
          <GenUISurface key={active.id} code={resolved} streaming={active.streaming} onError={(error, phase) => onCardError?.(error.message, phase)} onRendered={onCardRendered} />
        )}
      </div>
    </div>
  );
}
